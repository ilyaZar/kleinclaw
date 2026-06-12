/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { isRecord } from "../value-guards.js";
import { AdDefaults, } from "./ad-defaults-config.js";
import { BrowserConfig, LoginConfig, } from "./browser-login-config.js";
import { DiagnosticsConfig, } from "./diagnostics-config.js";
import { DownloadConfig } from "./download-config.js";
import { DeletingConfig, PublishingConfig, } from "./publishing-config.js";
import { TimeoutConfig } from "./timeout-config.js";
import { UpdateCheckConfig, } from "./update-check-config.js";
import { ValidationError } from "./validation-error.js";
export { AdDefaults, AutoPriceReductionConfig, ContactDefaults, } from "./ad-defaults-config.js";
export { BrowserConfig, LoginConfig, } from "./browser-login-config.js";
export { CaptureOnConfig, DiagnosticsConfig, } from "./diagnostics-config.js";
export { DownloadConfig, } from "./download-config.js";
export { DeletingConfig, PublishingConfig, } from "./publishing-config.js";
export { TimeoutConfig, } from "./timeout-config.js";
export { UpdateCheckConfig, } from "./update-check-config.js";
export { ValidationError } from "./validation-error.js";
export class Config {
    adFiles;
    adDefaults;
    categories;
    download;
    publishing;
    deleting;
    browser;
    login;
    diagnostics;
    timeouts;
    updateCheck;
    constructor(input = {}) {
        this.adFiles = input.adFiles ?? input.ad_files ?? ["./**/ad_*.{json,yml,yaml}"];
        if (!this.adFiles.length || this.adFiles.some((pattern) => !pattern.trim())) {
            throw new ValidationError("ad_files must contain non-empty glob patterns");
        }
        this.adDefaults = new AdDefaults(input.adDefaults ?? input.ad_defaults ?? {});
        this.categories = { ...(input.categories ?? {}) };
        this.download = new DownloadConfig(input.download ?? {});
        this.publishing = new PublishingConfig(input.publishing ?? {});
        this.deleting = new DeletingConfig(input.deleting ?? {});
        this.browser = new BrowserConfig(input.browser ?? {});
        this.login = new LoginConfig(input.login ?? {});
        this.diagnostics = new DiagnosticsConfig(input.diagnostics ?? {});
        this.timeouts = new TimeoutConfig(input.timeouts ?? {});
        this.updateCheck = new UpdateCheckConfig(input.updateCheck ?? input.update_check ?? {});
    }
    withValues(values) {
        return new Config(deepMerge(configToInput(this), values));
    }
}
function configToInput(config) {
    return {
        adFiles: config.adFiles,
        adDefaults: {
            active: config.adDefaults.active,
            type: config.adDefaults.type,
            descriptionPrefix: config.adDefaults.descriptionPrefix,
            descriptionSuffix: config.adDefaults.descriptionSuffix,
            priceType: config.adDefaults.priceType,
            autoPriceReduction: config.adDefaults.autoPriceReduction,
            shippingType: config.adDefaults.shippingType,
            sellDirectly: config.adDefaults.sellDirectly,
            images: config.adDefaults.images,
            contact: config.adDefaults.contact,
            republicationInterval: config.adDefaults.republicationInterval,
        },
        categories: config.categories,
        download: config.download,
        publishing: config.publishing,
        deleting: config.deleting,
        browser: config.browser,
        login: config.login,
        diagnostics: config.diagnostics,
        timeouts: config.timeouts,
        updateCheck: config.updateCheck,
    };
}
function deepMerge(base, patch) {
    if (!isRecord(patch)) {
        return base;
    }
    const result = {
        ...base,
    };
    for (const [key, value] of Object.entries(patch)) {
        const current = result[key];
        result[key] = isRecord(current) && isRecord(value)
            ? deepMerge(current, value)
            : value;
    }
    return result;
}
