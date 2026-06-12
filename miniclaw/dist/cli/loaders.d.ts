import { type Config } from "../model/config-model.js";
import { type LoadedAd } from "../selection.js";
import { type Workspace } from "../workspace.js";
import { type ParsedArgs } from "./types.js";
export interface LoadedSideEffectAds {
    ads: LoadedAd[];
    config: Config;
}
export interface LoadedDownloadCommand {
    config: Config;
    downloadDir: string;
    effectiveSelector: string;
    savedAds: LoadedAd[];
}
export declare function loadSideEffectAds(parsed: ParsedArgs): Promise<LoadedSideEffectAds>;
export declare function resolveDownloadDir(config: Config, configPath: string, workspace: Workspace): string;
export declare function loadDownloadCommand(parsed: ParsedArgs, workspace: Workspace): Promise<LoadedDownloadCommand>;
