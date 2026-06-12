import { type AdInput } from "../model/ad-model.js";
export declare const AD_SCHEMA_HEADER: string;
export declare const STAGING_DIR_PREFIX = ".tmp-";
export interface SaveDownloadedAdOptions {
    adConfig: AdInput;
    adFileStem: string;
    adId: number;
    finalDir: string;
    stagingDir: string;
}
export declare function removeTreeWithRetries(target: string): Promise<void>;
export declare function fileExists(filePath: string): Promise<boolean>;
export declare function saveDownloadedAd({ adConfig, adFileStem, adId, finalDir, stagingDir, }: SaveDownloadedAdOptions): Promise<void>;
export declare class FileExistsError extends Error {
    constructor(message: string);
}
