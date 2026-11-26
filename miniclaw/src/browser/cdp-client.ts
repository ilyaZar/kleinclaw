/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { TimeoutError } from "../web/errors.js";

export interface JsonTarget {
  id?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export interface CdpRemoteObject {
  objectId?: string;
  subtype?: string;
  type?: string;
  unserializableValue?: string;
  value?: unknown;
}

export interface CdpCommandResult {
  result?: CdpRemoteObject;
  exceptionDetails?: {
    text?: string;
    exception?: { description?: string; value?: unknown };
  };
  [key: string]: unknown;
}

interface PendingCommand {
  reject(error: Error): void;
  resolve(value: CdpCommandResult): void;
  timer: NodeJS.Timeout;
}

type CdpEventHandler = (params: Record<string, unknown>) => void;

export const CDP_POLL_MS = 100;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function timeoutError(message: string): Error {
  return new TimeoutError(message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchJson<T>(
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

export function cdpValue(result: CdpRemoteObject | undefined): unknown {
  if (!result) {
    return undefined;
  }
  if ("value" in result) {
    return result.value;
  }
  return result.unserializableValue ?? undefined;
}

export function throwCdpException(
  response: CdpCommandResult,
  fallback: string,
): void {
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
      const timer = setTimeout(
        () => reject(timeoutError("Timed out opening CDP WebSocket")),
        this.defaultTimeoutMs,
      );
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
          ? Buffer.from(
              data.buffer,
              data.byteOffset,
              data.byteLength,
            ).toString("utf8")
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
      pending.reject(
        new Error(message.error.message ?? `CDP command ${message.id} failed`),
      );
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
