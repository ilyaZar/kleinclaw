/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import fs from "node:fs/promises";
import path from "node:path";

import {
  extractCategoryFromAdPage as extractPageCategory,
  extractSpecialAttributesFromAdPage as extractPageSpecialAttributes,
} from "./download-extractor/download-extractor-classification.js";
import {
  extractContactFromAdPage as extractPageContact,
  extractSellDirectlyFromAdPage as extractPageSellDirectly,
} from "./download-extractor/download-extractor-contact.js";
import {
  downloadAndSaveImage as downloadImageFile,
  downloadImagesFromAdPage as downloadPageImages,
  type DownloadImage,
  type DownloadImageOptions,
} from "./download-extractor/download-extractor-images.js";
import {
  islandContactName,
  islandCreationDate,
  islandImageUrls,
  islandPricing,
  islandShippingText,
  readIslandProps,
  type IslandProps,
} from "./download-extractor/download-extractor-island.js";
import {
  dimensionsFromBelenConf,
  fetchAnonymousAdDimensions,
  parseGermanCreationDate,
  textAttribute,
  translateDamageAttribute,
} from "./download-extractor/download-extractor-page-data.js";
import {
  extractPricingInfoFromAdPage as extractPagePricingInfo,
  extractShippingInfoFromAdPage as extractPageShippingInfo,
} from "./download-extractor/download-extractor-pricing-shipping.js";
import {
  renderDownloadAdFileStem as renderConfiguredDownloadAdFileStem,
  renderDownloadFolderName as renderConfiguredDownloadFolderName,
} from "./download-extractor/download-extractor-naming.js";
import {
  fileExists,
  removeTreeWithRetries,
  saveDownloadedAd,
  STAGING_DIR_PREFIX,
} from "./download-extractor/download-extractor-persistence.js";
import {
  type WebReadController,
} from "./download-extractor/download-extractor-controller.js";
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
} from "./web-primitives.js";

export interface DownloadExtractorController extends WebReadController {
  readonly page?: { url?: string };
  webExecute(jscode: string): Promise<unknown>;
  webSleep?(minMs?: number, maxMs?: number): Promise<void>;
}

const CREATION_DATE_SELECTORS: readonly [By, string][] = [
  [By.CSS_SELECTOR, "#viewad-extra-info > div:nth-child(1) > span:nth-child(2)"],
  [By.CSS_SELECTOR, "#viewad-extra-info span"],
];

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
  fetchAnonymousDimensions?: (adId: number) => Promise<Record<string, unknown> | null>;
  publishedAdsById?: ReadonlyMap<number, unknown>;
}

export class DownloadAdExtractor {
  readonly controller: DownloadExtractorController;
  readonly config: Config;
  readonly publishedAdsById: ReadonlyMap<number, unknown>;
  downloadDir: string;

  private readonly downloadImage: DownloadImage;
  private readonly fetchAnonymousDimensions: (
    adId: number,
  ) => Promise<Record<string, unknown> | null>;

  constructor({
    controller,
    config,
    downloadDir,
    downloadImage = DownloadAdExtractor.downloadAndSaveImage,
    fetchAnonymousDimensions = (adId) => fetchAnonymousAdDimensions(adId, {
      timeoutMs: config.timeouts.resolve("pageLoad") * 1000,
    }),
    publishedAdsById = new Map(),
  }: DownloadAdExtractorOptions) {
    this.controller = controller;
    this.config = config;
    this.downloadDir = downloadDir;
    this.downloadImage = downloadImage;
    this.fetchAnonymousDimensions = fetchAnonymousDimensions;
    this.publishedAdsById = publishedAdsById;
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

  renderDownloadAdFileStem(adId: number, title: string): string {
    return renderConfiguredDownloadAdFileStem(this.config, adId, title);
  }

  renderDownloadFolderName(adId: number, title: string): string {
    return renderConfiguredDownloadFolderName(this.config, adId, title);
  }

  async downloadImagesFromAdPage(
    directory: string,
    adFileStem: string,
    island: IslandProps = {},
  ): Promise<string[]> {
    return downloadPageImages(
      this.controller,
      this.downloadImage,
      directory,
      adFileStem,
      {
        imageDownloadTimeout: this.config.timeouts.resolve("imageDownload"),
        islandImageUrls: islandImageUrls(island),
      },
    );
  }

  async extractTitleFromAdPage(): Promise<string> {
    return this.controller.webText(By.ID, "viewad-title");
  }

  async extractCategoryFromAdPage(): Promise<string> {
    return extractPageCategory(this.controller);
  }

  async extractSpecialAttributesFromAdPage(
    dimensions: Record<string, unknown>,
    island: IslandProps = {},
  ): Promise<Record<string, string>> {
    return extractPageSpecialAttributes(this.controller, dimensions, island);
  }

  async extractPricingInfoFromAdPage(island: IslandProps = {}): Promise<[
    AdInput["price"],
    NonNullable<AdInput["price_type"]>,
  ]> {
    return extractPagePricingInfo(this.controller, islandPricing(island));
  }

  async extractShippingInfoFromAdPage(island: IslandProps = {}): Promise<[
    NonNullable<AdInput["shipping_type"]>,
    number | null,
    string[] | null,
  ]> {
    return extractPageShippingInfo(this.config, this.controller, islandShippingText(island));
  }

  async extractSellDirectlyFromAdPage(): Promise<boolean | null> {
    return extractPageSellDirectly(
      this.controller.page?.url ?? "",
      this.publishedAdsById,
    );
  }

  async extractContactFromAdPage(island: IslandProps = {}): Promise<ContactInput> {
    return extractPageContact(this.controller, islandContactName(island));
  }

  // classic selectors first, then the island date; each classic lookup is
  // skipped at once when the page lacks it and the island has a date
  private async extractCreationDate(island: IslandProps): Promise<string> {
    const islandDate = islandCreationDate(island);
    for (const [type, value] of CREATION_DATE_SELECTORS) {
      if (islandDate && await this.controller.webProbe?.(type, value) === null) {
        continue;
      }
      try {
        const text = (await this.controller.webText(type, value)).trim();
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
          return text;
        }
      } catch (error) {
        if (!(error instanceof TimeoutError)) {
          throw error;
        }
      }
    }
    if (islandDate) {
      return islandDate;
    }
    throw new TimeoutError("Could not extract the creation date from the ad page");
  }

  async extractAdPageInfo(
    directory: string,
    adId: number,
    adFileStem: string,
    options: DownloadAdOptions = {},
  ): Promise<AdInput> {
    const active = options.active ?? true;
    const title = await this.extractTitleFromAdPage();
    const island = await readIslandProps(this.controller);
    let dimensions = dimensionsFromBelenConf(
      await this.controller.webExecute("window.BelenConf"),
    );
    // Redesigned ad pages define no BelenConf; the anonymous ad page does.
    if (Object.keys(dimensions).length === 0) {
      await this.controller.webSleep?.();
      dimensions = await this.fetchAnonymousDimensions(adId) ?? {};
    }
    const rawAdType = textAttribute(dimensions, "ad_type");
    const adType = rawAdType === "OFFERED" ? "OFFER" : rawAdType;
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
      await this.extractSpecialAttributesFromAdPage(dimensions, island);
    if (typeof specialAttributes.schaden_s === "string") {
      specialAttributes.schaden_s = translateDamageAttribute(
        specialAttributes.schaden_s,
      );
    }
    info.special_attributes = specialAttributes;

    const [price, priceType] = await this.extractPricingInfoFromAdPage(island);
    info.price = price;
    info.price_type = priceType;

    const [shippingType, shippingCosts, shippingOptions] =
      await this.extractShippingInfoFromAdPage(island);
    info.shipping_type = shippingType;
    info.shipping_costs = shippingCosts;
    info.shipping_options = shippingOptions;
    info.sell_directly = await this.extractSellDirectlyFromAdPage();
    info.images = await this.downloadImagesFromAdPage(directory, adFileStem, island);
    info.contact = await this.extractContactFromAdPage(island);
    info.id = adId;

    const creationDate = await this.extractCreationDate(island);
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
