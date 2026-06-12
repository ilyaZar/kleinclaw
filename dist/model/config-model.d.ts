import { AdDefaults, type AdDefaultsInput } from "./ad-defaults-config.js";
import { BrowserConfig, type BrowserConfigInput, LoginConfig, type LoginConfigInput } from "./browser-login-config.js";
import { DiagnosticsConfig, type DiagnosticsConfigInput } from "./diagnostics-config.js";
import { DownloadConfig, type DownloadConfigInput } from "./download-config.js";
import { DeletingConfig, type DeletingConfigInput, PublishingConfig, type PublishingConfigInput } from "./publishing-config.js";
import { TimeoutConfig, type TimeoutConfigInput } from "./timeout-config.js";
import { UpdateCheckConfig, type UpdateCheckConfigInput } from "./update-check-config.js";
export { AdDefaults, AutoPriceReductionConfig, ContactDefaults, type AdDefaultsInput, type AutoPriceReductionConfigInput, type AutoPriceReductionStrategy, type ContactDefaultsInput, } from "./ad-defaults-config.js";
export { BrowserConfig, LoginConfig, type BrowserConfigInput, type LoginConfigInput, } from "./browser-login-config.js";
export { CaptureOnConfig, DiagnosticsConfig, type CaptureOnConfigInput, type DiagnosticsConfigInput, } from "./diagnostics-config.js";
export { DownloadConfig, type DownloadConfigInput, } from "./download-config.js";
export { DeletingConfig, PublishingConfig, type AfterDeletePolicy, type DeletingConfigInput, type PublishingConfigInput, type PublishingDeleteOldAdsPolicy, } from "./publishing-config.js";
export { TimeoutConfig, type TimeoutConfigInput, type TimeoutKey, } from "./timeout-config.js";
export { UpdateCheckConfig, type UpdateCheckChannel, type UpdateCheckConfigInput, } from "./update-check-config.js";
export { ValidationError } from "./validation-error.js";
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
    updateCheck?: UpdateCheckConfigInput;
    update_check?: UpdateCheckConfigInput;
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
    readonly updateCheck: UpdateCheckConfig;
    constructor(input?: ConfigInput);
    withValues(values: ConfigInput): Config;
}
