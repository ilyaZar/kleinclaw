/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";

import {
  CDP_POLL_MS,
  fetchJson,
  type JsonTarget,
  sleep,
  timeoutError,
} from "./cdp-client.js";
import { CdpPage } from "./cdp-page.js";
import { type BrowserSessionPlan } from "./browser-session-plan.js";

function browserEndpoint(host: string, port: number): string {
  return `http://${host}:${port}`;
}

async function allocatePort(host = "127.0.0.1"): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Failed to allocate browser debugging port"));
        }
      });
    });
  });
}

async function waitForEndpoint(
  endpoint: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  do {
    try {
      await fetchJson<Record<string, unknown>>(`${endpoint}/json/version`, {
        timeoutMs: Math.min(1000, timeoutMs),
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(CDP_POLL_MS);
    }
  } while (Date.now() < deadline);
  throw timeoutError(
    `Browser process not reachable at ${endpoint}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function browserWebSocketUrl(
  endpoint: string,
  timeoutMs: number,
): Promise<string> {
  const version = await fetchJson<Record<string, unknown>>(
    `${endpoint}/json/version`,
    { timeoutMs },
  );
  const url = version.webSocketDebuggerUrl;
  if (typeof url !== "string" || !url) {
    throw new Error("Browser CDP endpoint did not expose webSocketDebuggerUrl");
  }
  return url;
}

async function listTargets(
  endpoint: string,
  timeoutMs: number,
): Promise<JsonTarget[]> {
  return await fetchJson<JsonTarget[]>(`${endpoint}/json/list`, { timeoutMs });
}

async function createTarget(
  endpoint: string,
  timeoutMs: number,
): Promise<JsonTarget> {
  return await fetchJson<JsonTarget>(
    `${endpoint}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT", timeoutMs },
  );
}

async function initializedPagesFromTargets(
  endpoint: string,
  timeoutMs: number,
): Promise<CdpPage[]> {
  const targets = (await listTargets(endpoint, timeoutMs))
    .filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  const pages = targets.map(
    (target) => new CdpPage(endpoint, target, timeoutMs),
  );
  await Promise.all(pages.map((page) => page.init()));
  return pages;
}

export class CdpContext {
  private readonly initialPages: CdpPage[];
  private readonly openedPages: CdpPage[] = [];

  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs: number,
    private readonly owner: CdpBrowser | null = null,
    initialPages: CdpPage[] = [],
  ) {
    this.initialPages = [...initialPages];
  }

  browser(): CdpBrowser | null {
    return this.owner;
  }

  pages(): CdpPage[] {
    return [...this.initialPages, ...this.openedPages];
  }

  async newPage(): Promise<CdpPage> {
    const target = await createTarget(this.endpoint, this.timeoutMs);
    const page = new CdpPage(this.endpoint, target, this.timeoutMs);
    await page.init();
    this.openedPages.push(page);
    return page;
  }

  async close(): Promise<void> {
    for (const page of this.openedPages.splice(0)) {
      await page.close();
    }
    for (const page of this.initialPages.splice(0)) {
      await page.dispose();
    }
  }
}

export class CdpBrowser {
  private readonly context: CdpContext;

  constructor(
    endpoint: string,
    timeoutMs: number,
    private readonly process: ChildProcess | null = null,
    initialPages: CdpPage[] = [],
  ) {
    this.context = new CdpContext(endpoint, timeoutMs, this, initialPages);
  }

  contexts(): CdpContext[] {
    return [this.context];
  }

  async close(): Promise<void> {
    await this.context.close();
    if (!this.process) {
      return;
    }
    const pid = this.process.pid;
    if (!pid) {
      return;
    }
    try {
      process.kill(-pid, "SIGTERM");
      await sleep(500);
    } catch {
      // Process may already be gone.
    }
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Process may already be gone.
    }
  }
}

export async function connectCdpBrowser(
  endpoint: string,
  { timeoutMs = 30000 }: { timeoutMs?: number } = {},
): Promise<CdpBrowser> {
  await waitForEndpoint(endpoint, timeoutMs);
  const pages = await initializedPagesFromTargets(endpoint, timeoutMs);
  return new CdpBrowser(endpoint, timeoutMs, null, pages);
}

export async function launchCdpBrowser(
  plan: BrowserSessionPlan,
  { timeoutMs = 30000 }: { timeoutMs?: number } = {},
): Promise<CdpContext> {
  const port = await allocatePort(plan.remoteHost);
  const endpoint = browserEndpoint(plan.remoteHost, port);
  const args = [
    ...plan.browserArgs,
    `--remote-debugging-host=${plan.remoteHost}`,
    `--remote-debugging-port=${port}`,
  ];
  if (plan.userDataDir) {
    args.push(`--user-data-dir=${plan.userDataDir}`);
  }
  if (plan.extensionPaths.length > 0) {
    for (const extensionPath of plan.extensionPaths) {
      try {
        await fs.access(extensionPath);
      } catch {
        throw new Error(
          `Configured extension-file [${extensionPath}] does not exist.`,
        );
      }
    }
    args.push(`--load-extension=${plan.extensionPaths.join(",")}`);
  }
  const child = spawn(plan.browserExecutablePath, args, {
    detached: true,
    env: { ...process.env, ...plan.environment },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let launchError: Error | null = null;
  child.stderr?.resume();
  child.once("error", (error: Error) => {
    launchError = error;
  });
  try {
    await waitForEndpoint(endpoint, timeoutMs);
  } catch (error) {
    throw launchError ?? error;
  }
  await browserWebSocketUrl(endpoint, timeoutMs);
  const pages = await initializedPagesFromTargets(endpoint, timeoutMs);
  return new CdpBrowser(endpoint, timeoutMs, child, pages).contexts()[0]!;
}
