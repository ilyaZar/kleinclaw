/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { performance } from "node:perf_hooks";

import { type TimeoutConfig, type TimeoutKey } from "../model/timeout-config.js";
import { type TimingRecorder } from "../timing-collector.js";
import { TimeoutError, isTimeoutLike } from "./errors.js";
import { type WebControllerOptions, type WebPage } from "./types.js";

export class ControllerTiming {
  readonly page: WebPage;
  readonly defaultTimeout: number;

  protected readonly timeSource: () => number;
  protected readonly sleeper: (ms: number) => Promise<void>;
  protected readonly timeoutConfig: TimeoutConfig | null;

  private readonly timingCollector: TimingRecorder | null;
  private readonly defaultTimeoutOverride: number | null;
  private readonly sleepRangeMs: [number, number];
  private readonly randomInt: (maxExclusive: number) => number;

  constructor(page: WebPage, options: WebControllerOptions = {}) {
    this.page = page;
    this.defaultTimeoutOverride = options.defaultTimeout ?? null;
    this.timeoutConfig = options.timeoutConfig ?? null;
    this.defaultTimeout =
      options.defaultTimeout ?? options.timeoutConfig?.default ?? 5;
    this.timingCollector = options.timingCollector ?? null;
    this.timeSource = options.timeSource ?? (() => performance.now() / 1000);
    this.sleepRangeMs = options.sleepRangeMs ?? [1000, 2500];
    this.randomInt = options.randomInt ?? ((maxExclusive) =>
      Math.floor(Math.random() * maxExclusive));
    this.sleeper = options.sleep ?? ((ms) =>
      this.page.waitForTimeout
        ? this.page.waitForTimeout(ms)
        : new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async webAwait<T>(
    condition: () => T | Promise<T>,
    {
      timeout,
      timeoutErrorMessage = "",
      applyMultiplier = true,
    }: {
      timeout?: number | null;
      timeoutErrorMessage?: string;
      applyMultiplier?: boolean;
    } = {},
  ): Promise<T> {
    const baseTimeout = timeout ?? this.baseTimeout("default");
    const effectiveTimeout = applyMultiplier
      ? this.effectiveTimeout("default", baseTimeout, 0)
      : baseTimeout;
    const startedAt = this.timeSource();

    while (true) {
      let currentError: unknown = null;
      try {
        const result = await condition();
        if (result) {
          return result;
        }
      } catch (error) {
        currentError = error;
      }

      const elapsed = this.timeSource() - startedAt;
      if (elapsed >= effectiveTimeout) {
        if (currentError) {
          throw currentError;
        }
        throw new TimeoutError(
          timeoutErrorMessage ||
            `Condition not met within ${effectiveTimeout} seconds`,
        );
      }

      const remainingMs = Math.max(effectiveTimeout - elapsed, 0) * 1000;
      await this.sleeper(Math.min(500, remainingMs));
    }
  }

  async webSleep(minMs?: number, maxMs?: number): Promise<void> {
    const min = minMs ?? this.sleepRangeMs[0];
    const max = maxMs ?? this.sleepRangeMs[1];
    const duration = max <= min ? min : this.randomInt(max - min) + min;
    if (duration > 0) {
      await this.sleeper(duration);
    }
  }

  protected async withTimeout<T>(
    operation: Promise<T>,
    timeout: number,
    timeoutErrorMessage: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new TimeoutError(timeoutErrorMessage)),
            Math.max(1, Math.trunc(timeout * 1000)),
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  protected baseTimeout(key: TimeoutKey, override?: number | null): number {
    if (this.timeoutConfig) {
      if (override !== null && override !== undefined) {
        return this.timeoutConfig.resolve(key, override);
      }
      if (key === "default" && this.defaultTimeoutOverride !== null) {
        return this.defaultTimeoutOverride;
      }
      return this.timeoutConfig.resolve(key);
    }
    return override ?? this.defaultTimeout;
  }

  protected effectiveTimeout(
    key: TimeoutKey,
    override?: number | null,
    attempt = 0,
  ): number {
    if (this.timeoutConfig) {
      if (override !== null && override !== undefined) {
        return this.timeoutConfig.effective(key, override, { attempt });
      }
      if (key === "default" && this.defaultTimeoutOverride !== null) {
        return this.defaultTimeoutOverride *
          this.timeoutConfig.multiplier *
          (attempt > 0
            ? this.timeoutConfig.retryBackoffFactor ** attempt
            : 1);
      }
      return this.timeoutConfig.effective(key, null, { attempt });
    }
    return override ?? this.defaultTimeout;
  }

  protected recordTiming(
    key: TimeoutKey,
    description: string,
    configuredTimeout: number,
    effectiveTimeout: number,
    actualDuration: number,
    attemptIndex: number,
    success: boolean,
  ): void {
    if (!this.timingCollector) {
      return;
    }
    const operationType = description.includes("(")
      ? description.split("(", 1)[0] ?? description
      : description;
    try {
      this.timingCollector.record({
        actualDuration,
        attemptIndex,
        configuredTimeout,
        description,
        effectiveTimeout,
        key,
        operationType,
        success,
      });
    } catch {
      return;
    }
  }

  protected async runWithTimeoutRetries<T>(
    operation: (timeout: number) => Promise<T>,
    {
      description,
      key,
      timeout,
    }: {
      description: string;
      key: TimeoutKey;
      timeout?: number | null;
    },
  ): Promise<T> {
    const attempts = this.timeoutConfig?.attempts() ?? 1;
    const configuredTimeout = this.baseTimeout(key, timeout);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const effectiveTimeout = this.effectiveTimeout(key, timeout, attempt);
      const startedAt = this.timeSource();
      try {
        const result = await operation(effectiveTimeout);
        this.recordTiming(
          key,
          description,
          configuredTimeout,
          effectiveTimeout,
          this.timeSource() - startedAt,
          attempt,
          true,
        );
        return result;
      } catch (error) {
        if (!isTimeoutLike(error)) {
          throw error;
        }
        this.recordTiming(
          key,
          description,
          configuredTimeout,
          effectiveTimeout,
          this.timeSource() - startedAt,
          attempt,
          false,
        );
        if (attempt >= attempts - 1) {
          throw error;
        }
      }
    }

    throw new TimeoutError(`${description} failed without executing operation`);
  }
}
