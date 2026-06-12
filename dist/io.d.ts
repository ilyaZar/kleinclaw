import { toAd } from "./model/ad-model.js";
import { Config } from "./model/config-model.js";
export declare function loadDataFile(filePath: string): Promise<unknown>;
export declare function saveDataFile(filePath: string, data: Record<string, unknown>, { header }?: {
    header?: string;
}): Promise<void>;
export declare function loadConfigFile(filePath: string): Promise<Config>;
export declare function loadAdFile(filePath: string, config: Config): Promise<ReturnType<typeof toAd>>;
