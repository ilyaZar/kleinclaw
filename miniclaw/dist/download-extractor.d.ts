import { type DownloadImage, type DownloadImageOptions } from "./download-extractor/download-extractor-images.js";
import { type IslandProps } from "./download-extractor/download-extractor-island.js";
import { type WebReadController } from "./download-extractor/download-extractor-controller.js";
import { type AdInput, type ContactInput } from "./model/ad-model.js";
import { type Config } from "./model/config-model.js";
export interface DownloadExtractorController extends WebReadController {
    readonly page?: {
        url?: string;
    };
    webExecute(jscode: string): Promise<unknown>;
    webSleep?(minMs?: number, maxMs?: number): Promise<void>;
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
    fetchAnonymousDimensions?: (adId: number) => Promise<Record<string, unknown> | null>;
    publishedAdsById?: ReadonlyMap<number, unknown>;
}
export declare class DownloadAdExtractor {
    readonly controller: DownloadExtractorController;
    readonly config: Config;
    readonly publishedAdsById: ReadonlyMap<number, unknown>;
    downloadDir: string;
    private readonly downloadImage;
    private readonly fetchAnonymousDimensions;
    constructor({ controller, config, downloadDir, downloadImage, fetchAnonymousDimensions, publishedAdsById, }: DownloadAdExtractorOptions);
    static downloadAndSaveImage(url: string, directory: string, filenamePrefix: string, imageNumber: number, options?: DownloadImageOptions): Promise<string | null>;
    renderDownloadAdFileStem(adId: number, title: string): string;
    renderDownloadFolderName(adId: number, title: string): string;
    downloadImagesFromAdPage(directory: string, adFileStem: string, island?: IslandProps): Promise<string[]>;
    extractTitleFromAdPage(): Promise<string>;
    extractCategoryFromAdPage(): Promise<string>;
    extractSpecialAttributesFromAdPage(dimensions: Record<string, unknown>, island?: IslandProps): Promise<Record<string, string>>;
    extractPricingInfoFromAdPage(island?: IslandProps): Promise<[
        AdInput["price"],
        NonNullable<AdInput["price_type"]>
    ]>;
    extractShippingInfoFromAdPage(island?: IslandProps): Promise<[
        NonNullable<AdInput["shipping_type"]>,
        number | null,
        string[] | null
    ]>;
    extractSellDirectlyFromAdPage(): Promise<boolean | null>;
    extractContactFromAdPage(island?: IslandProps): Promise<ContactInput>;
    private extractCreationDate;
    extractAdPageInfo(directory: string, adId: number, adFileStem: string, options?: DownloadAdOptions): Promise<AdInput>;
    extractAdPageInfoWithDirectoryHandling(relativeDirectory: string, adId: number, options?: DownloadAdOptions): Promise<ExtractAdPageInfoResult>;
    downloadAd(adId: number, options?: DownloadAdOptions): Promise<void>;
}
