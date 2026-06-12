import { type AdInput, type Ad } from "./model/ad-model.js";
import { type PublishedAdState } from "./publish-orchestration.js";
import { type LoadedAd } from "./selection.js";
export declare const EXTEND_WINDOW_DAYS = 8;
export interface ExtendPublishedAdState extends PublishedAdState {
    endDate?: unknown;
}
export interface ExtendAdContext {
    ad: Ad;
    adFile: string;
    publishedAd: ExtendPublishedAdState;
    raw: LoadedAd["raw"];
    relativePath: string;
}
export type ExtendAdHook = (context: ExtendAdContext) => Promise<boolean | void> | boolean | void;
export type ExtendBatchEventStatus = "extended" | "failed" | "skipped-end-date" | "skipped-inactive" | "skipped-missing" | "skipped-outside-window" | "skipped-unpublished";
export interface ExtendBatchEvent {
    adFile: string;
    adId: number | null;
    daysUntilExpiry?: number;
    relativePath: string;
    status: ExtendBatchEventStatus;
    title: string;
}
export interface ExtendBatchResult {
    attempted: number;
    events: ExtendBatchEvent[];
    extended: number;
    skipped: number;
    total: number;
}
export interface ExtendAdsBatchOptions {
    extendAd: ExtendAdHook;
    now?: Date;
    publishedAds?: readonly ExtendPublishedAdState[];
    saveAdConfig?: (adFile: string, adConfig: AdInput) => Promise<void> | void;
    sleep?: () => Promise<void> | void;
}
export declare function parseGermanDate(value: unknown): Date | null;
export declare function daysUntilEndDate(endDate: Date, now?: Date): number;
export declare function runExtendAdsBatch(loadedAds: readonly LoadedAd[], { extendAd, now, publishedAds, saveAdConfig, sleep, }: ExtendAdsBatchOptions): Promise<ExtendBatchResult>;
