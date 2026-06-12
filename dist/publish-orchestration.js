/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { idsMatch } from "./ad-identity.js";
import { AdUpdateStrategy } from "./model/ad-model.js";
import { CategoryResolutionError, PublishSubmissionUncertainError, } from "./publish-form.js";
import { errorMessage, errorName, hasErrorName, } from "./value-guards.js";
import { TimeoutError } from "./web-primitives.js";
export const SUBMISSION_MAX_RETRIES = 3;
export const SUBMISSION_RETRY_DELAY_MS = 2000;
function makeResult(mode, total) {
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
function normalizedRetryCount(maxRetries) {
    if (maxRetries === undefined || !Number.isFinite(maxRetries)) {
        return SUBMISSION_MAX_RETRIES;
    }
    return Math.max(1, Math.trunc(maxRetries));
}
function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function eventFor(loadedAd, mode, status, { attempt, error, } = {}) {
    const event = {
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
function findPublishedAd(ad, publishedAds) {
    return publishedAds.find((publishedAd) => idsMatch(ad.id, publishedAd.id)) ?? null;
}
function isPausedPublishedAd(publishedAd) {
    return typeof publishedAd?.state === "string" &&
        publishedAd.state.toLowerCase() === "paused";
}
function isCancellationError(error) {
    return hasErrorName(error, "AbortError") ||
        hasErrorName(error, "CancelledError");
}
function isTerminalPublishError(error) {
    return error instanceof CategoryResolutionError ||
        error instanceof PublishSubmissionUncertainError ||
        hasErrorName(error, "CategoryResolutionError") ||
        hasErrorName(error, "PublishSubmissionUncertainError");
}
export function isDefaultRetryablePublishError(error) {
    return error instanceof TimeoutError ||
        hasErrorName(error, "TimeoutError") ||
        hasErrorName(error, "ProtocolException") ||
        hasErrorName(error, "ProtocolError");
}
function attemptContext(loadedAd, mode, publishedAds, attempt) {
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
function publishingResultContext(loadedAd, mode, publishedAds) {
    return {
        ad: loadedAd.ad,
        adFile: loadedAd.filePath,
        mode,
        publishedAds,
        raw: loadedAd.raw,
        relativePath: loadedAd.relativePath,
    };
}
async function maybeDeleteBeforePublish(loadedAd, publishedAds, options) {
    if (options.mode !== AdUpdateStrategy.Replace ||
        options.keepOldAds ||
        options.deleteOldAds !== "BEFORE_PUBLISH" ||
        !options.deleteAd) {
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
async function maybeDeleteAfterPublish(loadedAd, publishedAds, options) {
    if (options.mode !== AdUpdateStrategy.Replace ||
        options.keepOldAds ||
        options.deleteOldAds !== "AFTER_PUBLISH" ||
        !options.deleteAd) {
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
async function maybeWaitForPublishingResult(loadedAd, result, publishedAds, options) {
    if (!options.waitForPublishingResult) {
        return;
    }
    try {
        await options.waitForPublishingResult(publishingResultContext(loadedAd, options.mode, publishedAds));
    }
    catch (error) {
        if (!isDefaultRetryablePublishError(error)) {
            throw error;
        }
        result.resultTimeouts += 1;
        result.events.push(eventFor(loadedAd, options.mode, "result-timeout", {
            error,
        }));
    }
}
async function runAttemptLoop(loadedAd, result, options) {
    const maxRetries = normalizedRetryCount(options.maxRetries);
    const retryDelayMs = options.retryDelayMs ?? SUBMISSION_RETRY_DELAY_MS;
    const publishedAds = options.publishedAds ?? [];
    const sleep = options.sleep ?? defaultSleep;
    const isRetryable = options.isRetryableError ?? isDefaultRetryablePublishError;
    const baselinePrice = loadedAd.ad.price;
    const baselinePriceReductionCount = loadedAd.ad.priceReductionCount;
    result.attempted += 1;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        loadedAd.ad.price = baselinePrice;
        loadedAd.ad.priceReductionCount = baselinePriceReductionCount;
        const context = attemptContext(loadedAd, options.mode, publishedAds, attempt);
        try {
            await maybeDeleteBeforePublish(loadedAd, publishedAds, options);
            await options.publishAd(context);
            result.events.push(eventFor(loadedAd, options.mode, "success", {
                attempt,
            }));
            await maybeWaitForPublishingResult(loadedAd, result, publishedAds, options);
            await maybeDeleteAfterPublish(loadedAd, publishedAds, options);
            result.succeeded += 1;
            return;
        }
        catch (error) {
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
export async function runPublishAdsBatch(loadedAds, options) {
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
export async function runUpdateAdsBatch(loadedAds, options) {
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
