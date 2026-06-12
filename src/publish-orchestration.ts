/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { idsMatch } from "./ad-identity.js";
import { AdUpdateStrategy, type Ad } from "./model/ad-model.js";
import {
  CategoryResolutionError,
  PublishSubmissionUncertainError,
} from "./publish-form.js";
import { type LoadedAd } from "./selection.js";
import {
  errorMessage,
  errorName,
  hasErrorName,
} from "./value-guards.js";
import { TimeoutError } from "./web-primitives.js";

export const SUBMISSION_MAX_RETRIES = 3;
export const SUBMISSION_RETRY_DELAY_MS = 2000;

export type DeleteOldAdsPolicy =
  | "NEVER"
  | "BEFORE_PUBLISH"
  | "AFTER_PUBLISH";

export interface PublishedAdState {
  id?: unknown;
  state?: unknown;
}

export interface PublishAttemptContext {
  ad: Ad;
  adFile: string;
  attempt: number;
  mode: AdUpdateStrategy;
  publishedAds: readonly PublishedAdState[];
  raw: LoadedAd["raw"];
  relativePath: string;
}

export interface PublishErrorContext extends PublishAttemptContext {
  error: unknown;
}

export interface DeleteAdContext {
  ad: Ad;
  adFile: string;
  deleteOldAdsByTitle: boolean;
  publishedAds: readonly PublishedAdState[];
  raw: LoadedAd["raw"];
  relativePath: string;
}

export interface PublishingResultContext {
  ad: Ad;
  adFile: string;
  mode: AdUpdateStrategy;
  publishedAds: readonly PublishedAdState[];
  raw: LoadedAd["raw"];
  relativePath: string;
}

export type PublishAdAttempt = (
  context: PublishAttemptContext,
) => Promise<void> | void;
export type CapturePublishError = (
  context: PublishErrorContext,
) => Promise<void> | void;
export type DeleteAdHook = (
  context: DeleteAdContext,
) => Promise<boolean | void> | boolean | void;
export type PublishingResultHook = (
  context: PublishingResultContext,
) => Promise<void> | void;
export type SleepHook = (ms: number) => Promise<void> | void;

export interface PublishBatchBaseOptions {
  captureError?: CapturePublishError;
  isRetryableError?: (error: unknown) => boolean;
  maxRetries?: number;
  publishedAds?: readonly PublishedAdState[];
  publishAd: PublishAdAttempt;
  retryDelayMs?: number;
  sleep?: SleepHook;
  waitForPublishingResult?: PublishingResultHook;
}

export interface PublishAdsBatchOptions extends PublishBatchBaseOptions {
  deleteAd?: DeleteAdHook;
  deleteOldAds?: DeleteOldAdsPolicy;
  deleteOldAdsByTitle?: boolean;
  keepOldAds?: boolean;
}

export type UpdateAdsBatchOptions = PublishBatchBaseOptions;

export type PublishBatchEventStatus =
  | "failed"
  | "result-timeout"
  | "retry"
  | "skipped-missing"
  | "skipped-paused"
  | "success";

export interface PublishBatchEvent {
  adFile: string;
  adId: number | null;
  attempt?: number;
  errorMessage?: string;
  errorName?: string;
  mode: AdUpdateStrategy;
  relativePath: string;
  status: PublishBatchEventStatus;
  title: string;
}

export interface PublishBatchResult {
  attempted: number;
  events: PublishBatchEvent[];
  failed: number;
  mode: AdUpdateStrategy;
  resultTimeouts: number;
  skippedMissing: number;
  skippedPaused: number;
  succeeded: number;
  total: number;
}

interface AttemptLoopOptions extends PublishBatchBaseOptions {
  deleteAd?: DeleteAdHook;
  deleteOldAds?: DeleteOldAdsPolicy;
  deleteOldAdsByTitle?: boolean;
  keepOldAds?: boolean;
  mode: AdUpdateStrategy;
}

function makeResult(
  mode: AdUpdateStrategy,
  total: number,
): PublishBatchResult {
  return {
    attempted: 0,
    events: [],
    failed: 0,
    mode,
    resultTimeouts: 0,
    skippedMissing: 0,
    skippedPaused: 0,
    succeeded: 0,
    total,
  };
}

function normalizedRetryCount(maxRetries: number | undefined): number {
  if (maxRetries === undefined || !Number.isFinite(maxRetries)) {
    return SUBMISSION_MAX_RETRIES;
  }
  return Math.max(1, Math.trunc(maxRetries));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function eventFor(
  loadedAd: LoadedAd,
  mode: AdUpdateStrategy,
  status: PublishBatchEventStatus,
  {
    attempt,
    error,
  }: {
    attempt?: number;
    error?: unknown;
  } = {},
): PublishBatchEvent {
  const event: PublishBatchEvent = {
    adFile: loadedAd.filePath,
    adId: loadedAd.ad.id,
    mode,
    relativePath: loadedAd.relativePath,
    status,
    title: loadedAd.ad.title,
  };
  if (attempt !== undefined) {
    event.attempt = attempt;
  }
  if (error !== undefined) {
    event.errorName = errorName(error);
    event.errorMessage = errorMessage(error);
  }
  return event;
}

function findPublishedAd(
  ad: Ad,
  publishedAds: readonly PublishedAdState[],
): PublishedAdState | null {
  return publishedAds.find((publishedAd) => idsMatch(ad.id, publishedAd.id)) ?? null;
}

function isPausedPublishedAd(publishedAd: PublishedAdState | null): boolean {
  return typeof publishedAd?.state === "string" &&
    publishedAd.state.toLowerCase() === "paused";
}

function isCancellationError(error: unknown): boolean {
  return hasErrorName(error, "AbortError") ||
    hasErrorName(error, "CancelledError");
}

function isTerminalPublishError(error: unknown): boolean {
  return error instanceof CategoryResolutionError ||
    error instanceof PublishSubmissionUncertainError ||
    hasErrorName(error, "CategoryResolutionError") ||
    hasErrorName(error, "PublishSubmissionUncertainError");
}

export function isDefaultRetryablePublishError(error: unknown): boolean {
  return error instanceof TimeoutError ||
    hasErrorName(error, "TimeoutError") ||
    hasErrorName(error, "ProtocolException") ||
    hasErrorName(error, "ProtocolError");
}

function attemptContext(
  loadedAd: LoadedAd,
  mode: AdUpdateStrategy,
  publishedAds: readonly PublishedAdState[],
  attempt: number,
): PublishAttemptContext {
  return {
    ad: loadedAd.ad,
    adFile: loadedAd.filePath,
    attempt,
    mode,
    publishedAds,
    raw: loadedAd.raw,
    relativePath: loadedAd.relativePath,
  };
}

function publishingResultContext(
  loadedAd: LoadedAd,
  mode: AdUpdateStrategy,
  publishedAds: readonly PublishedAdState[],
): PublishingResultContext {
  return {
    ad: loadedAd.ad,
    adFile: loadedAd.filePath,
    mode,
    publishedAds,
    raw: loadedAd.raw,
    relativePath: loadedAd.relativePath,
  };
}

async function maybeDeleteBeforePublish(
  loadedAd: LoadedAd,
  publishedAds: readonly PublishedAdState[],
  options: AttemptLoopOptions,
): Promise<void> {
  if (
    options.mode !== AdUpdateStrategy.Replace ||
    options.keepOldAds ||
    options.deleteOldAds !== "BEFORE_PUBLISH" ||
    !options.deleteAd
  ) {
    return;
  }
  await options.deleteAd({
    ad: loadedAd.ad,
    adFile: loadedAd.filePath,
    deleteOldAdsByTitle: options.deleteOldAdsByTitle ?? false,
    publishedAds,
    raw: loadedAd.raw,
    relativePath: loadedAd.relativePath,
  });
}

async function maybeDeleteAfterPublish(
  loadedAd: LoadedAd,
  publishedAds: readonly PublishedAdState[],
  options: AttemptLoopOptions,
): Promise<void> {
  if (
    options.mode !== AdUpdateStrategy.Replace ||
    options.keepOldAds ||
    options.deleteOldAds !== "AFTER_PUBLISH" ||
    !options.deleteAd
  ) {
    return;
  }
  await options.deleteAd({
    ad: loadedAd.ad,
    adFile: loadedAd.filePath,
    deleteOldAdsByTitle: false,
    publishedAds,
    raw: loadedAd.raw,
    relativePath: loadedAd.relativePath,
  });
}

async function maybeWaitForPublishingResult(
  loadedAd: LoadedAd,
  result: PublishBatchResult,
  publishedAds: readonly PublishedAdState[],
  options: AttemptLoopOptions,
): Promise<void> {
  if (!options.waitForPublishingResult) {
    return;
  }
  try {
    await options.waitForPublishingResult(
      publishingResultContext(loadedAd, options.mode, publishedAds),
    );
  } catch (error) {
    if (!isDefaultRetryablePublishError(error)) {
      throw error;
    }
    result.resultTimeouts += 1;
    result.events.push(eventFor(loadedAd, options.mode, "result-timeout", {
      error,
    }));
  }
}

async function runAttemptLoop(
  loadedAd: LoadedAd,
  result: PublishBatchResult,
  options: AttemptLoopOptions,
): Promise<void> {
  const maxRetries = normalizedRetryCount(options.maxRetries);
  const retryDelayMs = options.retryDelayMs ?? SUBMISSION_RETRY_DELAY_MS;
  const publishedAds = options.publishedAds ?? [];
  const sleep = options.sleep ?? defaultSleep;
  const isRetryable =
    options.isRetryableError ?? isDefaultRetryablePublishError;
  const baselinePrice = loadedAd.ad.price;
  const baselinePriceReductionCount = loadedAd.ad.priceReductionCount;

  result.attempted += 1;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    loadedAd.ad.price = baselinePrice;
    loadedAd.ad.priceReductionCount = baselinePriceReductionCount;

    const context = attemptContext(
      loadedAd,
      options.mode,
      publishedAds,
      attempt,
    );

    try {
      await maybeDeleteBeforePublish(loadedAd, publishedAds, options);
      await options.publishAd(context);
      result.events.push(eventFor(loadedAd, options.mode, "success", {
        attempt,
      }));
      await maybeWaitForPublishingResult(
        loadedAd,
        result,
        publishedAds,
        options,
      );
      await maybeDeleteAfterPublish(loadedAd, publishedAds, options);
      result.succeeded += 1;
      return;
    } catch (error) {
      if (isCancellationError(error)) {
        throw error;
      }

      const terminal = isTerminalPublishError(error);
      const retryable = isRetryable(error);
      if (!terminal && !retryable) {
        throw error;
      }

      if (options.captureError) {
        await options.captureError({ ...context, error });
      }

      if (terminal || attempt === maxRetries) {
        result.failed += 1;
        result.events.push(eventFor(loadedAd, options.mode, "failed", {
          attempt,
          error,
        }));
        return;
      }

      result.events.push(eventFor(loadedAd, options.mode, "retry", {
        attempt,
        error,
      }));
      await sleep(retryDelayMs);
    }
  }
}

export async function runPublishAdsBatch(
  loadedAds: readonly LoadedAd[],
  options: PublishAdsBatchOptions,
): Promise<PublishBatchResult> {
  const mode = AdUpdateStrategy.Replace;
  const result = makeResult(mode, loadedAds.length);
  const publishedAds = options.publishedAds ?? [];

  for (const loadedAd of loadedAds) {
    const publishedAd = findPublishedAd(loadedAd.ad, publishedAds);
    if (isPausedPublishedAd(publishedAd)) {
      result.skippedPaused += 1;
      result.events.push(eventFor(loadedAd, mode, "skipped-paused"));
      continue;
    }

    await runAttemptLoop(loadedAd, result, {
      ...options,
      mode,
      publishedAds,
    });
  }

  return result;
}

export async function runUpdateAdsBatch(
  loadedAds: readonly LoadedAd[],
  options: UpdateAdsBatchOptions,
): Promise<PublishBatchResult> {
  const mode = AdUpdateStrategy.Modify;
  const result = makeResult(mode, loadedAds.length);
  const publishedAds = options.publishedAds ?? [];

  for (const loadedAd of loadedAds) {
    const publishedAd = findPublishedAd(loadedAd.ad, publishedAds);
    if (!publishedAd) {
      result.skippedMissing += 1;
      result.events.push(eventFor(loadedAd, mode, "skipped-missing"));
      continue;
    }
    if (isPausedPublishedAd(publishedAd)) {
      result.skippedPaused += 1;
      result.events.push(eventFor(loadedAd, mode, "skipped-paused"));
      continue;
    }

    await runAttemptLoop(loadedAd, result, {
      ...options,
      mode,
      publishedAds,
    });
  }

  return result;
}
