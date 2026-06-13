import { type DownloadImage, type DownloadImageOptions } from "./download-extractor/images.js";
import { type AdInput, type ContactInput } from "./model/ad-model.js";
import { type Config } from "./model/config-model.js";
import { By, type WebElement, type WebLocator, type WebRequestOptions, type WebResponse } from "./web-primitives.js";
export { sanitizeFolderName, } from "./download-extractor/naming.js";
export { AD_SCHEMA_HEADER, FileExistsError, } from "./download-extractor/persistence.js";
export interface DownloadExtractorController {
    readonly page?: {
        url?: string;
    };
    webExecute(jscode: string): Promise<unknown>;
    webFind(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<WebLocator>;
    webFindAll(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<WebElement[]>;
    webText(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<string>;
    webRequest(url: string, method?: string, validResponseCodes?: number | Iterable<number>, headers?: Record<string, string> | null, options?: WebRequestOptions): Promise<WebResponse>;
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
export declare class DownloadAdExtractor {
    readonly controller: DownloadExtractorController;
    readonly config: Config;
    readonly publishedAdsById: ReadonlyMap<number, unknown>;
    downloadDir: string;
    private readonly downloadImage;
    constructor({ controller, config, downloadDir, downloadImage, publishedAdsById, }: DownloadAdExtractorOptions);
    static truncateLogSnippet(value: string, maxLength?: number): string;
    static downloadAndSaveImage(url: string, directory: string, filenamePrefix: string, imageNumber: number, options?: DownloadImageOptions): Promise<string | null>;
    renderDownloadNameWithBudget(template: string, adId: number, title: string, maxLength: number): string;
    renderDownloadAdFileStem(adId: number, title: string): string;
    renderDownloadFolderName(adId: number, title: string): string;
    downloadImagesFromAdPage(directory: string, adFileStem: string): Promise<string[]>;
    extractTitleFromAdPage(): Promise<string>;
    extractAdIdFromAdUrl(url: string): number;
    extractCategoryFromAdPage(): Promise<string>;
    extractSpecialAttributesFromAdPage(belenConf: unknown): Promise<Record<string, string>>;
    extractSpecialAttributesFromDom(): Promise<Record<string, string>>;
    extractPricingInfoFromAdPage(): Promise<[
        AdInput["price"],
        NonNullable<AdInput["price_type"]>
    ]>;
    extractShippingInfoFromAdPage(): Promise<[
        NonNullable<AdInput["shipping_type"]>,
        number | null,
        string[] | null
    ]>;
    extractSellDirectlyFromAdPage(): Promise<boolean | null>;
    extractContactFromAdPage(): Promise<ContactInput>;
    extractAdPageInfo(directory: string, adId: number, adFileStem: string, options?: DownloadAdOptions): Promise<AdInput>;
    extractAdPageInfoWithDirectoryHandling(relativeDirectory: string, adId: number, options?: DownloadAdOptions): Promise<ExtractAdPageInfoResult>;
    downloadAd(adId: number, options?: DownloadAdOptions): Promise<void>;
}
