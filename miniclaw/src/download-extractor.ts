/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import fs from "node:fs/promises";
import path from "node:path";

import { extractAdIdFromAdUrl as parseAdIdFromAdUrl } from "./ad-identity.js";
import {
  extractCategoryFromAdPage as extractPageCategory,
  extractSpecialAttributesFromAdPage as extractPageSpecialAttributes,
  extractSpecialAttributesFromDom as extractPageSpecialAttributesFromDom,
} from "./download-extractor/classification.js";
import {
  extractContactFromAdPage as extractPageContact,
  extractSellDirectlyFromAdPage as extractPageSellDirectly,
} from "./download-extractor/contact.js";
import {
  downloadAndSaveImage as downloadImageFile,
  downloadImagesFromAdPage as downloadPageImages,
  type DownloadImage,
  type DownloadImageOptions,
} from "./download-extractor/images.js";
import {
  dimensionsFromBelenConf,
  parseGermanCreationDate,
  textAttribute,
  translateDamageAttribute,
} from "./download-extractor/page-data.js";
import {
  extractPricingInfoFromAdPage as extractPagePricingInfo,
  extractShippingInfoFromAdPage as extractPageShippingInfo,
} from "./download-extractor/pricing-shipping.js";
import {
  renderDownloadAdFileStem as renderConfiguredDownloadAdFileStem,
  renderDownloadFolderName as renderConfiguredDownloadFolderName,
  renderDownloadNameWithBudget as renderConfiguredDownloadNameWithBudget,
} from "./download-extractor/naming.js";
import {
  fileExists,
  removeTreeWithRetries,
  saveDownloadedAd,
  STAGING_DIR_PREFIX,
} from "./download-extractor/persistence.js";
import {
  contentHashForLoadedAd,
  toAd,
  type AdInput,
  type ContactInput,
} from "./model/ad-model.js";
import { type Config } from "./model/config-model.js";
import {
  By,
  TimeoutError,
  type WebElement,
  type WebLocator,
  type WebRequestOptions,
  type WebResponse,
} from "./web-primitives.js";

export {
  sanitizeFolderName,
} from "./download-extractor/naming.js";
export {
  AD_SCHEMA_HEADER,
  FileExistsError,
} from "./download-extractor/persistence.js";

const LOG_SNIPPET_LIMIT = 120;
const ELLIPSIS = "...";

export interface DownloadExtractorController {
  readonly page?: { url?: string };
  webExecute(jscode: string): Promise<unknown>;
  webFind(
    type: By,
    value: string,
    options?: { parent?: WebLocator | WebElement | null; timeout?: number },
  ): Promise<WebLocator>;
  webFindAll(
    type: By,
    value: string,
    options?: { parent?: WebLocator | WebElement | null; timeout?: number },
  ): Promise<WebElement[]>;
  webText(
    type: By,
    value: string,
    options?: { parent?: WebLocator | WebElement | null; timeout?: number },
  ): Promise<string>;
  webRequest(
    url: string,
    method?: string,
    validResponseCodes?: number | Iterable<number>,
    headers?: Record<string, string> | null,
    options?: WebRequestOptions,
  ): Promise<WebResponse>;
}

export interface ExtractAdPageInfoResult {
  adConfig: AdInput;
  adFileStem: string;
  finalDir: string;
  stagingDir: string;
}

export interface DownloadAdOptions {
  active?: boolean | null;
}

export interface DownloadAdExtractorOptions {
  controller: DownloadExtractorController;
  config: Config;
  downloadDir: string;
  downloadImage?: DownloadImage;
  publishedAdsById?: ReadonlyMap<number, unknown>;
}

export class DownloadAdExtractor {
  readonly controller: DownloadExtractorController;
  readonly config: Config;
  readonly publishedAdsById: ReadonlyMap<number, unknown>;
  downloadDir: string;

  private readonly downloadImage: DownloadImage;

  constructor({
    controller,
    config,
    downloadDir,
    downloadImage = DownloadAdExtractor.downloadAndSaveImage,
    publishedAdsById = new Map(),
  }: DownloadAdExtractorOptions) {
    this.controller = controller;
    this.config = config;
    this.downloadDir = downloadDir;
    this.downloadImage = downloadImage;
    this.publishedAdsById = publishedAdsById;
  }

  static truncateLogSnippet(
    value: string,
    maxLength = LOG_SNIPPET_LIMIT,
  ): string {
    if (maxLength <= 0) {
      return "";
    }
    if (value.length <= maxLength) {
      return value;
    }
    if (maxLength <= ELLIPSIS.length) {
      return ELLIPSIS.slice(0, maxLength);
    }
    return value.slice(0, maxLength - ELLIPSIS.length) + ELLIPSIS;
  }

  static async downloadAndSaveImage(
    url: string,
    directory: string,
    filenamePrefix: string,
    imageNumber: number,
    options?: DownloadImageOptions,
  ): Promise<string | null> {
    return downloadImageFile(url, directory, filenamePrefix, imageNumber, options);
  }

  renderDownloadNameWithBudget(
    template: string,
    adId: number,
    title: string,
    maxLength: number,
  ): string {
    return renderConfiguredDownloadNameWithBudget(
      template,
      adId,
      title,
      maxLength,
    );
  }

  renderDownloadAdFileStem(adId: number, title: string): string {
    return renderConfiguredDownloadAdFileStem(this.config, adId, title);
  }

  renderDownloadFolderName(adId: number, title: string): string {
    return renderConfiguredDownloadFolderName(this.config, adId, title);
  }

  async downloadImagesFromAdPage(
    directory: string,
    adFileStem: string,
  ): Promise<string[]> {
    return downloadPageImages(
      this.controller,
      this.downloadImage,
      directory,
      adFileStem,
      { imageDownloadTimeout: this.config.timeouts.resolve("imageDownload") },
    );
  }

  async extractTitleFromAdPage(): Promise<string> {
    return this.controller.webText(By.ID, "viewad-title");
  }

  extractAdIdFromAdUrl(url: string): number {
    return parseAdIdFromAdUrl(url);
  }

  async extractCategoryFromAdPage(): Promise<string> {
    return extractPageCategory(this.controller);
  }

  async extractSpecialAttributesFromAdPage(
    belenConf: unknown,
  ): Promise<Record<string, string>> {
    return extractPageSpecialAttributes(this.controller, belenConf);
  }

  async extractSpecialAttributesFromDom(): Promise<Record<string, string>> {
    return extractPageSpecialAttributesFromDom(this.controller);
  }

  async extractPricingInfoFromAdPage(): Promise<[
    AdInput["price"],
    NonNullable<AdInput["price_type"]>,
  ]> {
    return extractPagePricingInfo(this.controller);
  }

  async extractShippingInfoFromAdPage(): Promise<[
    NonNullable<AdInput["shipping_type"]>,
    number | null,
    string[] | null,
  ]> {
    return extractPageShippingInfo(this.config, this.controller);
  }

  async extractSellDirectlyFromAdPage(): Promise<boolean | null> {
    return extractPageSellDirectly(
      this.controller.page?.url ?? "",
      this.publishedAdsById,
    );
  }

  async extractContactFromAdPage(): Promise<ContactInput> {
    return extractPageContact(this.controller);
  }

  async extractAdPageInfo(
    directory: string,
    adId: number,
    adFileStem: string,
    options: DownloadAdOptions = {},
  ): Promise<AdInput> {
    const active = options.active ?? true;
    const title = await this.extractTitleFromAdPage();
    const belenConf = await this.controller.webExecute("window.BelenConf");
    const dimensions = dimensionsFromBelenConf(belenConf);
    const adType = textAttribute(dimensions, "ad_type");
    const pageUrl = this.controller.page?.url ?? "";
    const info: AdInput = {
      active,
      type: adType === "OFFER" || adType === "WANTED"
        ? adType
        : pageUrl.includes("s-anzeige")
          ? "OFFER"
          : "WANTED",
      category: await this.extractCategoryFromAdPage(),
      title,
    };

    const thirdCategoryId = textAttribute(dimensions, "l3_category_id");
    if (thirdCategoryId) {
      info.category = `${info.category}/${thirdCategoryId}`;
    }

    const rawDescription = (
      await this.controller.webText(By.ID, "viewad-description-text")
    ).trim();
    let descriptionText = rawDescription;
    const prefix = this.config.adDefaults.descriptionPrefix.trim();
    const suffix = this.config.adDefaults.descriptionSuffix.trim();
    if (prefix && descriptionText.startsWith(prefix)) {
      descriptionText = descriptionText.slice(prefix.length);
    }
    if (suffix && descriptionText.endsWith(suffix)) {
      descriptionText = descriptionText.slice(0, -suffix.length);
    }
    info.description = descriptionText.trim();

    const specialAttributes =
      await this.extractSpecialAttributesFromAdPage(belenConf);
    if (typeof specialAttributes.schaden_s === "string") {
      specialAttributes.schaden_s = translateDamageAttribute(
        specialAttributes.schaden_s,
      );
    }
    info.special_attributes = specialAttributes;

    const [price, priceType] = await this.extractPricingInfoFromAdPage();
    info.price = price;
    info.price_type = priceType;

    const [shippingType, shippingCosts, shippingOptions] =
      await this.extractShippingInfoFromAdPage();
    info.shipping_type = shippingType;
    info.shipping_costs = shippingCosts;
    info.shipping_options = shippingOptions;
    info.sell_directly = await this.extractSellDirectlyFromAdPage();
    info.images = await this.downloadImagesFromAdPage(directory, adFileStem);
    info.contact = await this.extractContactFromAdPage();
    info.id = adId;

    let creationDate: string;
    try {
      creationDate = await this.controller.webText(
        By.XPATH,
        "/html/body/div[1]/div[2]/div/section[2]/section/section/" +
          "article/div[3]/div[2]/div[2]/div[1]/span",
      );
    } catch (error) {
      if (!(error instanceof TimeoutError)) {
        throw error;
      }
      creationDate = await this.controller.webText(
        By.CSS_SELECTOR,
        "#viewad-extra-info > div:nth-child(1) > span:nth-child(2)",
      );
    }

    info.created_on = parseGermanCreationDate(creationDate);
    info.updated_on = null;
    info.content_hash = contentHashForLoadedAd(toAd(info, this.config.adDefaults));
    return info;
  }

  async extractAdPageInfoWithDirectoryHandling(
    relativeDirectory: string,
    adId: number,
    options: DownloadAdOptions = {},
  ): Promise<ExtractAdPageInfoResult> {
    const title = await this.extractTitleFromAdPage();
    const adFileStem = this.renderDownloadAdFileStem(adId, title);
    const finalDir = path.join(
      relativeDirectory,
      this.renderDownloadFolderName(adId, title),
    );
    const stagingDir = path.join(relativeDirectory, `${STAGING_DIR_PREFIX}${adFileStem}`);

    if (await fileExists(stagingDir)) {
      await removeTreeWithRetries(stagingDir);
    }
    await fs.mkdir(stagingDir, { recursive: true });

    try {
      const adConfig = await this.extractAdPageInfo(
        stagingDir,
        adId,
        adFileStem,
        options,
      );
      return { adConfig, adFileStem, finalDir, stagingDir };
    } catch (error) {
      if (await fileExists(stagingDir)) {
        await removeTreeWithRetries(stagingDir);
      }
      throw error;
    }
  }

  async downloadAd(adId: number, options: DownloadAdOptions = {}): Promise<void> {
    const {
      adConfig,
      adFileStem,
      finalDir,
      stagingDir,
    } = await this.extractAdPageInfoWithDirectoryHandling(
      this.downloadDir,
      adId,
      options,
    );
    await saveDownloadedAd({
      adConfig,
      adFileStem,
      adId,
      finalDir,
      stagingDir,
    });
  }
}
