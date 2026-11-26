/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { AdDefaults, } from "./ad-defaults-config.js";
import { BrowserConfig, LoginConfig, } from "./browser-login-config.js";
import { DiagnosticsConfig, } from "./diagnostics-config.js";
import { DownloadConfig } from "./download-config.js";
import { DeletingConfig, PublishingConfig, } from "./publishing-config.js";
import { TimeoutConfig } from "./timeout-config.js";
import { ValidationError } from "./validation-error.js";
import { BUILTIN_CATEGORIES } from "../resources/categories.js";
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
    constructor(input = {}) {
        this.adFiles = input.adFiles ?? input.ad_files ?? ["./**/ad_*.{json,yml,yaml}"];
        if (!this.adFiles.length || this.adFiles.some((pattern) => !pattern.trim())) {
            throw new ValidationError("ad_files must contain non-empty glob patterns");
        }
        this.adDefaults = new AdDefaults(input.adDefaults ?? input.ad_defaults ?? {});
        this.categories = { ...BUILTIN_CATEGORIES, ...(input.categories ?? {}) };
        this.download = new DownloadConfig(input.download ?? {});
        this.publishing = new PublishingConfig(input.publishing ?? {});
        this.deleting = new DeletingConfig(input.deleting ?? {});
        this.browser = new BrowserConfig(input.browser ?? {});
        this.login = new LoginConfig(input.login ?? {});
        this.diagnostics = new DiagnosticsConfig(input.diagnostics ?? {});
        this.timeouts = new TimeoutConfig(input.timeouts ?? {});
    }
}
