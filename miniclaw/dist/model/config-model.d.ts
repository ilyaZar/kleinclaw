import { AdDefaults, type AdDefaultsInput } from "./ad-defaults-config.js";
import { BrowserConfig, type BrowserConfigInput, LoginConfig, type LoginConfigInput } from "./browser-login-config.js";
import { DiagnosticsConfig, type DiagnosticsConfigInput } from "./diagnostics-config.js";
import { DownloadConfig, type DownloadConfigInput } from "./download-config.js";
import { DeletingConfig, type DeletingConfigInput, PublishingConfig, type PublishingConfigInput } from "./publishing-config.js";
import { TimeoutConfig, type TimeoutConfigInput } from "./timeout-config.js";
export interface ConfigInput {
    adFiles?: string[];
    ad_files?: string[];
    adDefaults?: AdDefaultsInput;
    ad_defaults?: AdDefaultsInput;
    categories?: Record<string, string>;
    download?: DownloadConfigInput;
    publishing?: PublishingConfigInput;
    deleting?: DeletingConfigInput;
    browser?: BrowserConfigInput;
    login?: LoginConfigInput;
    diagnostics?: DiagnosticsConfigInput;
    timeouts?: TimeoutConfigInput;
}
export declare class Config {
    readonly adFiles: string[];
    readonly adDefaults: AdDefaults;
    readonly categories: Record<string, string>;
    readonly download: DownloadConfig;
    readonly publishing: PublishingConfig;
    readonly deleting: DeletingConfig;
    readonly browser: BrowserConfig;
    readonly login: LoginConfig;
    readonly diagnostics: DiagnosticsConfig;
    readonly timeouts: TimeoutConfig;
    constructor(input?: ConfigInput);
}
