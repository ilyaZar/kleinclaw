import { type AdInput, type Ad } from "./model/ad-model.js";
import { type AfterDeletePolicy } from "./model/config-model.js";
import { type DeleteAdHook, type PublishedAdState } from "./publish-orchestration.js";
import { type LoadedAd } from "./selection.js";
export type DeleteBatchEventStatus = "cleanup" | "deleted" | "not-attempted" | "not-found";
export interface DeleteBatchEvent {
    adFile: string;
    adId: number | null;
    relativePath: string;
    status: DeleteBatchEventStatus;
    title: string;
}
export interface DeleteBatchResult {
    cleanupApplied: number;
    deleted: number;
    events: DeleteBatchEvent[];
    processed: number;
    total: number;
}
export interface DeleteAdsBatchOptions {
    afterDelete?: AfterDeletePolicy;
    deleteAd: DeleteAdHook;
    deleteOldAdsByTitle?: boolean;
    publishedAds?: readonly PublishedAdState[];
    saveAdConfig?: (adFile: string, adConfig: AdInput) => Promise<void> | void;
    sleep?: () => Promise<void> | void;
}
export declare function applyAfterDeletePolicy(ad: Ad, raw: AdInput, mode: AfterDeletePolicy): boolean;
export declare function runDeleteAdsBatch(loadedAds: readonly LoadedAd[], { afterDelete, deleteAd, deleteOldAdsByTitle, publishedAds, saveAdConfig, sleep, }: DeleteAdsBatchOptions): Promise<DeleteBatchResult>;
