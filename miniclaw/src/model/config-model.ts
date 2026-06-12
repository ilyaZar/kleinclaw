/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { isRecord } from "../value-guards.js";
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
import {
  UpdateCheckConfig,
  type UpdateCheckConfigInput,
} from "./update-check-config.js";
import { ValidationError } from "./validation-error.js";

export {
  AdDefaults,
  AutoPriceReductionConfig,
  ContactDefaults,
  type AdDefaultsInput,
  type AutoPriceReductionConfigInput,
  type AutoPriceReductionStrategy,
  type ContactDefaultsInput,
} from "./ad-defaults-config.js";
export {
  BrowserConfig,
  LoginConfig,
  type BrowserConfigInput,
  type LoginConfigInput,
} from "./browser-login-config.js";
export {
  CaptureOnConfig,
  DiagnosticsConfig,
  type CaptureOnConfigInput,
  type DiagnosticsConfigInput,
} from "./diagnostics-config.js";
export {
  DownloadConfig,
  type DownloadConfigInput,
} from "./download-config.js";
export {
  DeletingConfig,
  PublishingConfig,
  type AfterDeletePolicy,
  type DeletingConfigInput,
  type PublishingConfigInput,
  type PublishingDeleteOldAdsPolicy,
} from "./publishing-config.js";
export {
  TimeoutConfig,
  type TimeoutConfigInput,
  type TimeoutKey,
} from "./timeout-config.js";
export {
  UpdateCheckConfig,
  type UpdateCheckChannel,
  type UpdateCheckConfigInput,
} from "./update-check-config.js";
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
  readonly updateCheck: UpdateCheckConfig;

  constructor(input: ConfigInput = {}) {
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
    this.updateCheck = new UpdateCheckConfig(
      input.updateCheck ?? input.update_check ?? {},
    );
  }

  withValues(values: ConfigInput): Config {
    return new Config(deepMerge(configToInput(this), values));
  }
}

function configToInput(config: Config): ConfigInput {
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

function deepMerge<T extends object>(base: T, patch: unknown): T {
  if (!isRecord(patch)) {
    return base;
  }
  const result: Record<string, unknown> = {
    ...(base as Record<string, unknown>),
  };
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    result[key] = isRecord(current) && isRecord(value)
      ? deepMerge(current, value)
      : value;
  }
  return result as T;
}
