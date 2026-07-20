import { type DownloadImage, type DownloadImageOptions } from "./download-extractor/download-extractor-images.js";
import { type WebReadController } from "./download-extractor/download-extractor-controller.js";
import { type AdInput, type ContactInput } from "./model/ad-model.js";
import { type Config } from "./model/config-model.js";
export interface DownloadExtractorController extends WebReadController {
    readonly page?: {
        url?: string;
    };
    webExecute(jscode: string): Promise<unknown>;
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
    static downloadAndSaveImage(url: string, directory: string, filenamePrefix: string, imageNumber: number, options?: DownloadImageOptions): Promise<string | null>;
    renderDownloadAdFileStem(adId: number, title: string): string;
    renderDownloadFolderName(adId: number, title: string): string;
    downloadImagesFromAdPage(directory: string, adFileStem: string): Promise<string[]>;
    extractTitleFromAdPage(): Promise<string>;
    extractCategoryFromAdPage(): Promise<string>;
    extractSpecialAttributesFromAdPage(belenConf: unknown): Promise<Record<string, string>>;
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
