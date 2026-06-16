/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { TimeoutError } from "../web/errors.js";
import {
  type WebElement,
  type WebLocator,
  type WebPage,
} from "../web/types.js";
import { type BrowserSessionPlan } from "./session-plan.js";

interface JsonTarget {
  id?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface CdpRemoteObject {
  objectId?: string;
  subtype?: string;
  type?: string;
  unserializableValue?: string;
  value?: unknown;
}

interface CdpCommandResult {
  result?: CdpRemoteObject;
  exceptionDetails?: {
    text?: string;
    exception?: { description?: string; value?: unknown };
  };
  [key: string]: unknown;
}

interface CdpElementHandle {
  backendNodeId?: number;
  objectId: string;
}

interface PendingCommand {
  reject(error: Error): void;
  resolve(value: CdpCommandResult): void;
  timer: NodeJS.Timeout;
}

type CdpEventHandler = (params: Record<string, unknown>) => void;
type LocatorKind = "css" | "text" | "xpath";

interface LocatorStep {
  bestMatch?: boolean;
  index: number;
  kind: LocatorKind;
  value: string;
}

const POLL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutError(message: string): Error {
  const error = new TimeoutError(message);
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function browserEndpoint(host: string, port: number): string {
  return `http://${host}:${port}`;
}

async function fetchJson<T>(
  url: string,
  {
    method = "GET",
    timeoutMs = 5000,
  }: {
    method?: string;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
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

async function waitForEndpoint(endpoint: string, timeoutMs: number): Promise<void> {
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
      await sleep(POLL_MS);
    }
  } while (Date.now() < deadline);
  throw timeoutError(
    `Browser process not reachable at ${endpoint}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function browserWebSocketUrl(endpoint: string, timeoutMs: number): Promise<string> {
  const version = await fetchJson<Record<string, unknown>>(`${endpoint}/json/version`, {
    timeoutMs,
  });
  const url = version.webSocketDebuggerUrl;
  if (typeof url !== "string" || !url) {
    throw new Error("Browser CDP endpoint did not expose webSocketDebuggerUrl");
  }
  return url;
}

async function listTargets(endpoint: string, timeoutMs: number): Promise<JsonTarget[]> {
  return await fetchJson<JsonTarget[]>(`${endpoint}/json/list`, { timeoutMs });
}

async function createTarget(endpoint: string, timeoutMs: number): Promise<JsonTarget> {
  return await fetchJson<JsonTarget>(
    `${endpoint}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT", timeoutMs },
  );
}

function parseSelector(selector: string): Omit<LocatorStep, "index"> {
  if (selector.startsWith("text=")) {
    return { kind: "text", value: selector.slice("text=".length) };
  }
  if (selector.startsWith("xpath=")) {
    return { kind: "xpath", value: selector.slice("xpath=".length) };
  }
  return { kind: "css", value: selector };
}

function expressionForSteps(steps: readonly LocatorStep[]): string {
  return `(() => {
    const textMatches = (root, step) => {
      const needle = String(step.value).trim();
      return Array.from(root.querySelectorAll("*")).filter((elem) =>
        (elem.textContent || "").includes(needle)
      );
    };
    const query = (root, step) => {
      if (!root) return null;
      const doc = root.ownerDocument || document;
      if (step.kind === "css") {
        return Array.from(root.querySelectorAll(step.value))[step.index] || null;
      }
      if (step.kind === "text") {
        const elements = textMatches(root, step);
        if (step.bestMatch) {
          return elements.reduce((closest, elem) => {
            if (!closest) return elem;
            const needleLength = String(step.value).trim().length;
            const currentDistance = Math.abs(
              needleLength - (elem.textContent || "").length
            );
            const closestDistance = Math.abs(
              needleLength - (closest.textContent || "").length
            );
            return currentDistance < closestDistance ? elem : closest;
          }, null);
        }
        return elements[step.index] || null;
      }
      const result = doc.evaluate(
        step.value,
        root === document ? document : root,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      return result.snapshotItem(step.index);
    };
    let current = document;
    const steps = ${JSON.stringify(steps)};
    for (const step of steps) {
      current = query(current, step);
      if (!current) return null;
    }
    return current;
  })()`;
}

function cdpValue(result: CdpRemoteObject | undefined): unknown {
  if (!result) {
    return undefined;
  }
  if ("value" in result) {
    return result.value;
  }
  return result.unserializableValue ?? undefined;
}

function throwCdpException(response: CdpCommandResult, fallback: string): void {
  if (!response.exceptionDetails) {
    return;
  }
  throw new Error(
    response.exceptionDetails.exception?.description ??
      response.exceptionDetails.text ??
      fallback,
  );
}

export class CdpClient {
  private nextId = 1;
  private socket: WebSocket | null = null;
  private readonly eventHandlers = new Map<string, Set<CdpEventHandler>>();
  private readonly pending = new Map<number, PendingCommand>();

  constructor(
    private readonly webSocketUrl: string,
    private readonly defaultTimeoutMs = 30000,
  ) {}

  async connect(): Promise<void> {
    if (this.socket) {
      return;
    }
    const socket = new WebSocket(this.webSocketUrl);
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      void this.handleMessage(event.data).catch((error) => {
        this.rejectAll(error instanceof Error ? error.message : String(error));
      });
    });
    socket.addEventListener("close", () => this.rejectAll("CDP WebSocket closed"));
    socket.addEventListener("error", () => this.rejectAll("CDP WebSocket failed"));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(timeoutError("Timed out opening CDP WebSocket")), this.defaultTimeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Failed to open CDP WebSocket"));
      }, { once: true });
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.rejectAll("CDP WebSocket closed");
  }

  on(method: string, handler: CdpEventHandler): () => void {
    const handlers = this.eventHandlers.get(method) ?? new Set<CdpEventHandler>();
    handlers.add(handler);
    this.eventHandlers.set(method, handlers);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(method);
      }
    };
  }

  async send(
    method: string,
    params: Record<string, unknown> = {},
    { timeoutMs = this.defaultTimeoutMs }: { timeoutMs?: number } = {},
  ): Promise<CdpCommandResult> {
    await this.connect();
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("CDP WebSocket is not open");
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return await new Promise<CdpCommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(timeoutError(`Timed out waiting for CDP method ${method}`));
      }, timeoutMs);
      this.pending.set(id, { reject, resolve, timer });
      this.socket!.send(payload);
    });
  }

  private async handleMessage(data: unknown): Promise<void> {
    const text = typeof data === "string"
      ? data
      : data instanceof Blob
        ? await data.text()
        : ArrayBuffer.isView(data)
          ? Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8")
          : Buffer.from(data as ArrayBuffer).toString("utf8");
    const message = JSON.parse(text);
    if (typeof message.method === "string") {
      const handlers = this.eventHandlers.get(message.method);
      if (handlers) {
        const params = isRecord(message.params) ? message.params : {};
        for (const handler of handlers) {
          handler(params);
        }
      }
      return;
    }
    if (typeof message.id !== "number") {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? `CDP command ${message.id} failed`));
      return;
    }
    pending.resolve(message.result ?? {});
  }

  private rejectAll(message: string): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      this.pending.delete(id);
    }
  }
}

export class CdpPage implements WebPage {
  url = "about:blank";
  readonly client: CdpClient;

  constructor(
    readonly endpoint: string,
    readonly target: JsonTarget,
    timeoutMs: number,
  ) {
    if (!target.webSocketDebuggerUrl) {
      throw new Error("Page target did not expose webSocketDebuggerUrl");
    }
    this.client = new CdpClient(target.webSocketDebuggerUrl, timeoutMs);
    this.url = target.url || "about:blank";
  }

  async init(): Promise<void> {
    await this.client.connect();
    this.trackNavigationEvents();
    await this.client.send("Page.enable");
    await this.client.send("Runtime.enable");
    await this.client.send("DOM.enable");
    await this.refreshUrl();
  }

  async close(): Promise<void> {
    if (this.target.id) {
      try {
        await fetchJson(`${this.endpoint}/json/close/${this.target.id}`, {
          timeoutMs: 2000,
        });
      } catch {
        // Best effort; closing the browser cleans up launched tabs.
      }
    }
    this.client.close();
  }

  async dispose(): Promise<void> {
    this.client.close();
  }

  async content(): Promise<string> {
    return String(await this.evaluate(
      "document.documentElement ? document.documentElement.outerHTML : ''",
    ));
  }

  async screenshot({ path: filePath }: { path: string }): Promise<{ path: string }> {
    const response = await this.client.send("Page.captureScreenshot", {
      captureBeyondViewport: true,
      format: "png",
    });
    const data = response.data;
    if (typeof data !== "string") {
      throw new Error("Page.captureScreenshot did not return image data");
    }
    await fs.writeFile(filePath, Buffer.from(data, "base64"));
    return { path: filePath };
  }

  locator(selector: string): WebLocator {
    const step = parseSelector(selector);
    return new CdpLocator(this, [{ ...step, index: 0 }]);
  }

  getByText(text: string): WebLocator {
    return new CdpLocator(this, [{
      bestMatch: true,
      index: 0,
      kind: "text",
      value: text,
    }]);
  }

  async evaluate(
    pageFunction: string | ((arg: unknown) => unknown),
    arg?: unknown,
  ): Promise<unknown> {
    const source = typeof pageFunction === "function"
      ? pageFunction.toString()
      : String(pageFunction);
    const expression = typeof pageFunction === "function"
      ? `(${source})(${JSON.stringify(arg)})`
      : arg === undefined
        ? source
        : `(${source})(${JSON.stringify(arg)})`;
    const response = await this.client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    throwCdpException(response, "Runtime.evaluate failed");
    return cdpValue(response.result);
  }

  async goto(
    url: string,
    options: { timeout?: number; waitUntil?: "load" | "domcontentloaded" } = {},
  ): Promise<void> {
    const timeoutMs = options.timeout ?? 15000;
    const navigationCommit = this.waitForNavigationCommit(timeoutMs);
    try {
      const response = await this.client.send("Page.navigate", { url }, { timeoutMs });
      if (typeof response.errorText === "string" && response.errorText) {
        throw new Error(`Page.navigate failed: ${response.errorText}`);
      }
      await navigationCommit.promise;
    } catch (error) {
      navigationCommit.cancel();
      throw error;
    }
    if (options.waitUntil) {
      await this.waitForLoadState(options.waitUntil, { timeout: timeoutMs });
    }
    await this.refreshUrl();
  }

  async waitForLoadState(
    state: "load" | "domcontentloaded" = "load",
    options: { timeout?: number } = {},
  ): Promise<void> {
    const wanted = state === "domcontentloaded" ? "interactive" : "complete";
    const timeoutMs = options.timeout ?? 15000;
    const deadline = Date.now() + timeoutMs;
    do {
      const readyState = await this.evaluate("document.readyState");
      if (readyState === "complete" || readyState === wanted) {
        await this.refreshUrl();
        return;
      }
      await sleep(POLL_MS);
    } while (Date.now() < deadline);
    throw timeoutError(`Page did not reach ${state} within ${timeoutMs / 1000} seconds`);
  }

  async waitForTimeout(ms: number): Promise<void> {
    await sleep(ms);
  }

  private waitForNavigationCommit(timeoutMs: number): {
    cancel(): void;
    promise: Promise<void>;
  } {
    let done = false;
    let timer: NodeJS.Timeout;
    let offFrameNavigated: () => void;
    let offSameDocument: () => void;

    const promise = new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        offFrameNavigated?.();
        offSameDocument?.();
      };
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        resolve();
      };
      const fail = (error: Error) => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        reject(error);
      };

      offFrameNavigated = this.client.on("Page.frameNavigated", (params) => {
        const frame = params.frame;
        if (
          isRecord(frame) &&
          !("parentId" in frame) &&
          typeof frame.url === "string"
        ) {
          this.url = frame.url;
          finish();
        }
      });
      offSameDocument = this.client.on("Page.navigatedWithinDocument", (params) => {
        if (typeof params.url === "string") {
          this.url = params.url;
          finish();
        }
      });
      timer = setTimeout(
        () => fail(timeoutError(
          `Page navigation did not commit within ${timeoutMs / 1000} seconds`,
        )),
        timeoutMs,
      );
    });

    return {
      cancel: () => {
        done = true;
        clearTimeout(timer);
        offFrameNavigated?.();
        offSameDocument?.();
      },
      promise,
    };
  }

  private trackNavigationEvents(): void {
    this.client.on("Page.frameNavigated", (params) => {
      const frame = params.frame;
      if (
        isRecord(frame) &&
        !("parentId" in frame) &&
        typeof frame.url === "string"
      ) {
        this.url = frame.url;
      }
    });
    this.client.on("Page.navigatedWithinDocument", (params) => {
      if (typeof params.url === "string") {
        this.url = params.url;
      }
    });
  }

  private async refreshUrl(): Promise<void> {
    const url = await this.evaluate("location.href");
    if (typeof url === "string" && url) {
      this.url = url;
    }
  }
}

export class CdpLocator implements WebLocator {
  constructor(
    private readonly page: CdpPage,
    private readonly steps: readonly LocatorStep[],
  ) {}

  first(): WebLocator {
    const next = [...this.steps];
    const last = next.at(-1);
    if (!last) {
      return this;
    }
    next[next.length - 1] = { ...last, index: 0 };
    return new CdpLocator(this.page, next);
  }

  nth(index: number): WebLocator {
    const next = [...this.steps];
    const last = next.at(-1);
    if (!last) {
      return this;
    }
    next[next.length - 1] = { ...last, bestMatch: false, index };
    return new CdpLocator(this.page, next);
  }

  locator(selector: string): WebLocator {
    const step = parseSelector(selector);
    return new CdpLocator(this.page, [...this.steps, { ...step, index: 0 }]);
  }

  async all(): Promise<WebElement[]> {
    const count = await this.count();
    return Array.from({ length: count }, (_, index) => this.nth(index));
  }

  async count(): Promise<number> {
    const steps = this.steps;
    return Number(await this.page.evaluate(`
      (() => {
        const textMatches = (root, step) => {
          const needle = String(step.value).trim();
          return Array.from(root.querySelectorAll("*")).filter((elem) =>
            (elem.textContent || "").includes(needle)
          );
        };
        const steps = ${JSON.stringify(steps)};
        const last = steps.pop();
        const rootSteps = steps;
        const query = (root, step) => {
          if (!root) return [];
          const doc = root.ownerDocument || document;
          if (step.kind === "css") return Array.from(root.querySelectorAll(step.value));
          if (step.kind === "text") {
            return textMatches(root, step);
          }
          const result = doc.evaluate(
            step.value,
            root === document ? document : root,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
          );
          return Array.from({ length: result.snapshotLength }, (_, index) => result.snapshotItem(index));
        };
        let current = document;
        for (const step of rootSteps) {
          current = query(current, step)[step.index] || null;
          if (!current) return 0;
        }
        return last ? query(current, last).length : 0;
      })()
    `));
  }

  async waitFor(options: { state?: "attached" | "visible"; timeout?: number } = {}): Promise<void> {
    const timeoutMs = options.timeout ?? 5000;
    const deadline = Date.now() + timeoutMs;
    do {
      try {
        if (options.state === "visible") {
          if (await this.isVisible()) {
            return;
          }
        } else if ((await this.count()) > 0) {
          return;
        }
      } catch {
        // Keep polling until the timeout, matching nodriver's wait loop.
      }
      await sleep(POLL_MS);
    } while (Date.now() < deadline);
    throw timeoutError(`No HTML element found within ${timeoutMs / 1000} seconds.`);
  }

  async click(): Promise<void> {
    const handle = await this.resolveElementHandle();
    if (!handle) {
      throw timeoutError("HTML element not found");
    }
    const response = await this.page.client.send("Runtime.callFunctionOn", {
      objectId: handle.objectId,
      functionDeclaration: "(el) => el.click()",
      arguments: [{ objectId: handle.objectId }],
      awaitPromise: true,
      userGesture: true,
      returnByValue: true,
    });
    throwCdpException(response, "Runtime.callFunctionOn failed");
  }

  async fill(value: string): Promise<void> {
    const objectId = await this.resolveObjectId();
    if (!objectId) {
      throw timeoutError("HTML element not found");
    }
    const response = await this.page.client.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `
      function (element, value) {
        element.value = String(value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    `,
      arguments: [{ objectId }, { value }],
      returnByValue: true,
      userGesture: true,
    });
    throwCdpException(response, "Runtime.callFunctionOn failed");
  }

  async press(key: string): Promise<void> {
    await this.evaluate("(element) => element.focus()");
    const codeByKey: Record<string, { code: string; keyCode: number }> = {
      ArrowDown: { code: "ArrowDown", keyCode: 40 },
      Backspace: { code: "Backspace", keyCode: 8 },
      Enter: { code: "Enter", keyCode: 13 },
    };
    const mapped = codeByKey[key] ?? { code: key, keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0 };
    const keyDown: Record<string, unknown> = {
      type: "keyDown",
      key,
      code: mapped.code,
      windowsVirtualKeyCode: mapped.keyCode,
      nativeVirtualKeyCode: mapped.keyCode,
    };
    if (key === "Enter") {
      keyDown.text = "\r";
    }
    await this.page.client.send("Input.dispatchKeyEvent", keyDown);
    await this.page.client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: mapped.code,
      windowsVirtualKeyCode: mapped.keyCode,
      nativeVirtualKeyCode: mapped.keyCode,
    });
  }

  async pressSequentially(value: string): Promise<void> {
    await this.type(value);
  }

  async type(value: string): Promise<void> {
    await this.evaluate("(element) => element.focus()");
    for (const char of value) {
      await this.page.client.send("Input.dispatchKeyEvent", {
        type: "char",
        text: char,
      });
    }
  }

  async sendFile(file: string): Promise<void> {
    await this.setInputFiles(file);
  }

  async setInputFiles(files: string | string[]): Promise<void> {
    const handle = await this.resolveElementHandle();
    if (!handle) {
      throw timeoutError("File input not found");
    }
    const params: Record<string, unknown> = {
      files: (Array.isArray(files) ? files : [files]).map((file) => path.resolve(file)),
      objectId: handle.objectId,
    };
    if (handle.backendNodeId !== undefined) {
      params.backendNodeId = handle.backendNodeId;
    }
    await this.page.client.send("DOM.setFileInputFiles", params);
  }

  async textContent(): Promise<string | null> {
    return await this.evaluate<string | null>("(element) => element.textContent");
  }

  async inputValue(): Promise<string> {
    return String(await this.evaluate("(element) => element.value || ''"));
  }

  async isChecked(): Promise<boolean> {
    return Boolean(await this.evaluate(`
      function (element) {
        if (element.tagName.toLowerCase() === 'input') {
          if (element.type === 'checkbox' || element.type === 'radio') {
            return element.checked
          }
        }
        return false
      }
    `));
  }

  async isDisabled(): Promise<boolean> {
    return Boolean(await this.evaluate("(element) => element.hasAttribute('disabled')"));
  }

  async isEditable(): Promise<boolean> {
    return Boolean(await this.evaluate(`
      function (element) {
        return !element.hasAttribute("disabled") &&
          !element.hasAttribute("readonly") &&
          (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
      }
    `));
  }

  async isEnabled(): Promise<boolean> {
    return !(await this.isDisabled());
  }

  async isVisible(): Promise<boolean> {
    return Boolean(await this.evaluate(`
      function (element) {
        const style = window.getComputedStyle(element);
        return style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          element.offsetWidth > 0 &&
          element.offsetHeight > 0;
      }
    `));
  }

  async getAttribute(name: string): Promise<string | null> {
    return await this.evaluate<string | null>(
      `(element) => element.getAttribute(${JSON.stringify(name)})`,
    );
  }

  async evaluate<T = unknown>(pageFunction: string | ((element: unknown) => T)): Promise<T> {
    const objectId = await this.resolveObjectId();
    if (!objectId) {
      throw timeoutError("HTML element not found");
    }
    const source = typeof pageFunction === "function"
      ? pageFunction.toString()
      : String(pageFunction);
    const response = await this.page.client.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: source,
      arguments: [{ objectId }],
      returnByValue: true,
      userGesture: true,
    });
    throwCdpException(response, "Runtime.callFunctionOn failed");
    return cdpValue(response.result) as T;
  }

  private async resolveObjectId(): Promise<string | null> {
    const handle = await this.resolveElementHandle();
    return handle?.objectId ?? null;
  }

  private async resolveElementHandle(): Promise<CdpElementHandle | null> {
    const response = await this.page.client.send("Runtime.evaluate", {
      expression: expressionForSteps(this.steps),
      objectGroup: "miniclaw-locator",
      returnByValue: false,
    });
    const result = response.result;
    if (!result?.objectId || result.subtype === "null") {
      return null;
    }
    let backendNodeId: number | undefined;
    try {
      const describe = await this.page.client.send("DOM.describeNode", {
        objectId: result.objectId,
      });
      const node = describe.node as { backendNodeId?: unknown } | undefined;
      if (typeof node?.backendNodeId === "number") {
        backendNodeId = node.backendNodeId;
      }
    } catch {
      // objectId alone is accepted by CDP; backendNodeId restores nodriver parity.
    }
    return { backendNodeId, objectId: result.objectId };
  }
}

async function initializedPagesFromTargets(
  endpoint: string,
  timeoutMs: number,
): Promise<CdpPage[]> {
  const targets = (await listTargets(endpoint, timeoutMs))
    .filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  const pages = targets.map((target) => new CdpPage(endpoint, target, timeoutMs));
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
  private readonly browserClient: CdpClient | null;

  constructor(
    endpoint: string,
    timeoutMs: number,
    private readonly process: ChildProcess | null = null,
    initialPages: CdpPage[] = [],
  ) {
    this.context = new CdpContext(endpoint, timeoutMs, this, initialPages);
    this.browserClient = null;
  }

  contexts(): CdpContext[] {
    return [this.context];
  }

  async close(): Promise<void> {
    await this.context.close();
    this.browserClient?.close();
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
        throw new Error(`Configured extension-file [${extensionPath}] does not exist.`);
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
