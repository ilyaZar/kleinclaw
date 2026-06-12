import { type Ad, type AdInput } from "./model/ad-model.js";
import { Config } from "./model/config-model.js";
export interface LoadedAd {
    filePath: string;
    relativePath: string;
    ad: Ad;
    raw: AdInput;
}
export interface LoadAdsOptions {
    configPath: string;
    config: Config;
    selector: string;
    ignoreInactive?: boolean;
    excludeAdsWithId?: boolean;
    now?: Date;
}
export declare function findAdFiles(configPath: string, config: Config): Promise<string[]>;
export declare function isDueForRepublication(ad: Ad, now?: Date): boolean;
export declare function isChangedAd(raw: AdInput, ad: Ad): boolean;
export declare function loadSelectedAds({ configPath, config, selector, ignoreInactive, excludeAdsWithId, now, }: LoadAdsOptions): Promise<LoadedAd[]>;
