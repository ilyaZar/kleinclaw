/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  AdDefaults,
  type AdDefaultsInput,
} from "./ad-defaults-config.js";
import {
  BrowserConfig,
  type BrowserConfigInput,
  LoginConfig,
  type LoginConfigInput,
} from "./browser-login-config.js";
import {
  DiagnosticsConfig,
  type DiagnosticsConfigInput,
} from "./diagnostics-config.js";
import { DownloadConfig, type DownloadConfigInput } from "./download-config.js";
import {
  DeletingConfig,
  type DeletingConfigInput,
  PublishingConfig,
  type PublishingConfigInput,
} from "./publishing-config.js";
import { TimeoutConfig, type TimeoutConfigInput } from "./timeout-config.js";
import { ValidationError } from "./validation-error.js";
import { BUILTIN_CATEGORIES } from "../resources/categories.js";

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

export class Config {
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

  constructor(input: ConfigInput = {}) {
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
