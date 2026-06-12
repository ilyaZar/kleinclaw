import { AdUpdateStrategy, type Ad } from "./model/ad-model.js";
import { type LoadedAd } from "./selection.js";
export declare const SUBMISSION_MAX_RETRIES = 3;
export declare const SUBMISSION_RETRY_DELAY_MS = 2000;
export type DeleteOldAdsPolicy = "NEVER" | "BEFORE_PUBLISH" | "AFTER_PUBLISH";
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
export type PublishAdAttempt = (context: PublishAttemptContext) => Promise<void> | void;
export type CapturePublishError = (context: PublishErrorContext) => Promise<void> | void;
export type DeleteAdHook = (context: DeleteAdContext) => Promise<boolean | void> | boolean | void;
export type PublishingResultHook = (context: PublishingResultContext) => Promise<void> | void;
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
export type PublishBatchEventStatus = "failed" | "result-timeout" | "retry" | "skipped-missing" | "skipped-paused" | "success";
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
export declare function isDefaultRetryablePublishError(error: unknown): boolean;
export declare function runPublishAdsBatch(loadedAds: readonly LoadedAd[], options: PublishAdsBatchOptions): Promise<PublishBatchResult>;
export declare function runUpdateAdsBatch(loadedAds: readonly LoadedAd[], options: UpdateAdsBatchOptions): Promise<PublishBatchResult>;
