import { type PublishedAdState } from "./publish-orchestration.js";
import { type LoadedAd } from "./selection.js";
export { extractAdIdFromAdUrl } from "./ad-identity.js";
export interface DownloadPublishedAdState extends PublishedAdState {
}
export interface ResolvedDownloadAdActivity {
    active: boolean;
    owned: boolean;
    publishedAd: DownloadPublishedAdState | null;
}
export interface DownloadAdContext extends ResolvedDownloadAdActivity {
    adId: number;
    adUrl: string | null;
    downloadDir: string;
    source: DownloadSelectorMode;
}
export interface DownloadNavigationContext {
    adId: number;
    adUrl: string | null;
    source: DownloadSelectorMode;
}
export interface ExtractOwnAdsUrlsContext {
    downloadDir: string;
}
export type DownloadAdHook = (context: DownloadAdContext) => Promise<void> | void;
export type ExtractOwnAdsUrlsHook = (context: ExtractOwnAdsUrlsContext) => Promise<readonly string[]> | readonly string[];
export type NavigateToAdPageHook = (context: DownloadNavigationContext) => Promise<boolean | void> | boolean | void;
export type DownloadSelectorMode = "all" | "new" | "numeric";
export type DownloadBatchEventStatus = "downloaded" | "skipped-invalid-id" | "skipped-navigation" | "skipped-saved";
export interface DownloadBatchEvent {
    adId: number | null;
    adUrl: string | null;
    source: DownloadSelectorMode;
    status: DownloadBatchEventStatus;
}
export interface DownloadBatchResult {
    downloaded: number;
    events: DownloadBatchEvent[];
    selector: string;
    skipped: number;
    targetCount: number;
    total: number;
}
export interface DownloadAdsBatchOptions {
    downloadAd: DownloadAdHook;
    downloadDir: string;
    extractOwnAdsUrls: ExtractOwnAdsUrlsHook;
    navigateToAdPage: NavigateToAdPageHook;
    publishedAds?: readonly DownloadPublishedAdState[];
    savedAds?: readonly LoadedAd[];
    selector: string;
}
export declare function normalizeDownloadSelector(selector: string): string;
export declare function publishedAdsById(publishedAds: readonly DownloadPublishedAdState[]): Map<number, DownloadPublishedAdState>;
export declare function resolveDownloadAdActivity(adId: number, adsById: ReadonlyMap<number, DownloadPublishedAdState>): ResolvedDownloadAdActivity;
export declare function runDownloadAdsBatch(options: DownloadAdsBatchOptions): Promise<DownloadBatchResult>;
