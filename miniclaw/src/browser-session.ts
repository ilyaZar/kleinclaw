/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

import {
  buildBrowserSessionPlan,
  writeInitialPrefs,
  type BrowserSessionPlan,
} from "./browser.js";
import { BrowserConfig, Config } from "./model/config-model.js";

export interface BrowserSessionPage {
  close?: () => Promise<void>;
}

export interface BrowserSessionContext {
  pages(): BrowserSessionPage[];
  newPage(): Promise<BrowserSessionPage>;
  close(): Promise<void>;
  browser?(): BrowserSessionBrowser | null;
}

export interface BrowserSessionBrowser {
  contexts(): BrowserSessionContext[];
  close(): Promise<void>;
}

export interface BrowserSessionDriver {
  connectOverCDP(
    endpointURL: string,
    options?: { timeout?: number },
  ): Promise<BrowserSessionBrowser>;
  launchPersistentContext(
    userDataDir: string,
    options?: {
      acceptDownloads?: boolean;
      args?: string[];
      chromiumSandbox?: boolean;
      env?: Record<string, string | undefined>;
      executablePath?: string;
      headless?: boolean;
      timeout?: number;
    },
  ): Promise<BrowserSessionContext>;
}

export interface CreateBrowserSessionOptions {
  allowLiveBrowser?: boolean;
  driver?: BrowserSessionDriver;
  timeout?: number;
  ensureProfilePrefs?: boolean;
}

export interface BrowserSession {
  mode: BrowserSessionPlan["mode"];
  browser: BrowserSessionBrowser | null;
  context: BrowserSessionContext;
  page: BrowserSessionPage;
  plan: BrowserSessionPlan;
  close(): Promise<void>;
}

export class LiveBrowserSessionDisabledError extends Error {
  constructor() {
    super(
      "Live browser sessions are disabled. Pass allowLiveBrowser: true " +
        "only from an explicitly approved manual run.",
    );
    this.name = "LiveBrowserSessionDisabledError";
  }
}

function defaultDriver(): BrowserSessionDriver {
  return {
    connectOverCDP: (endpointURL, options) =>
      chromium.connectOverCDP(endpointURL, options) as Promise<BrowserSessionBrowser>,
    launchPersistentContext: (userDataDir, options) =>
      chromium.launchPersistentContext(
        userDataDir,
        options,
      ) as Promise<BrowserSessionContext>,
  };
}

function isBrowserSessionPlan(value: unknown): value is BrowserSessionPlan {
  return (
    typeof value === "object" &&
    value !== null &&
    "mode" in value &&
    "browserArgs" in value &&
    "remoteHost" in value
  );
}

export function browserSessionPlanFrom(
  source: Config | BrowserConfig | BrowserSessionPlan,
): BrowserSessionPlan {
  return isBrowserSessionPlan(source)
    ? source
    : buildBrowserSessionPlan(source);
}

function firstContext(browser: BrowserSessionBrowser): BrowserSessionContext {
  const [context] = browser.contexts();
  if (!context) {
    throw new Error("Connected browser has no default context");
  }
  return context;
}

async function firstPage(context: BrowserSessionContext): Promise<BrowserSessionPage> {
  const [page] = context.pages();
  return page ?? context.newPage();
}

function ensureProfilePrefs(plan: BrowserSessionPlan): void {
  if (!plan.profileDir || !plan.preferencesFile) {
    return;
  }
  fs.mkdirSync(plan.profileDir, { recursive: true });
  if (!fs.existsSync(plan.preferencesFile)) {
    writeInitialPrefs(plan.preferencesFile);
  }
}

async function closeBrowserSession(
  mode: BrowserSessionPlan["mode"],
  browser: BrowserSessionBrowser | null,
  context: BrowserSessionContext,
): Promise<void> {
  if (mode === "launch") {
    await context.close();
    return;
  }
  if (browser) {
    await browser.close();
  } else {
    await context.close();
  }
}

export async function createBrowserSession(
  source: Config | BrowserConfig | BrowserSessionPlan,
  {
    allowLiveBrowser = false,
    driver = defaultDriver(),
    timeout,
    ensureProfilePrefs: shouldEnsureProfilePrefs = true,
  }: CreateBrowserSessionOptions = {},
): Promise<BrowserSession> {
  if (!allowLiveBrowser) {
    throw new LiveBrowserSessionDisabledError();
  }

  const plan = browserSessionPlanFrom(source);
  let browser: BrowserSessionBrowser | null = null;
  let context: BrowserSessionContext;

  if (plan.mode === "connect") {
    if (plan.remotePort === null) {
      throw new Error("Remote browser session plan is missing remotePort");
    }
    browser = await driver.connectOverCDP(
      `http://${plan.remoteHost}:${plan.remotePort}`,
      timeout === undefined ? undefined : { timeout: timeout * 1000 },
    );
    context = firstContext(browser);
  } else {
    if (shouldEnsureProfilePrefs) {
      ensureProfilePrefs(plan);
    }
    context = await driver.launchPersistentContext(
      plan.userDataDir ?? "",
      {
        acceptDownloads: true,
        args: plan.browserArgs,
        chromiumSandbox: plan.sandbox,
        env: { ...process.env, ...plan.environment },
        executablePath: plan.browserExecutablePath || undefined,
        headless: false,
        timeout: timeout === undefined ? undefined : timeout * 1000,
      },
    );
    browser = context.browser?.() ?? null;
  }

  const page = await firstPage(context);
  return {
    mode: plan.mode,
    browser,
    context,
    page,
    plan,
    close: () => closeBrowserSession(plan.mode, browser, context),
  };
}

export function preferencesFileForSession(plan: BrowserSessionPlan): string | null {
  return plan.preferencesFile ? path.resolve(plan.preferencesFile) : null;
}
