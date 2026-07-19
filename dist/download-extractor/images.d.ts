import { type WebReadController } from "./controller.js";
export type DownloadImage = (url: string, directory: string, filenamePrefix: string, imageNumber: number, options?: DownloadImageOptions) => Promise<string | null> | string | null;
export interface DownloadImageOptions {
    timeout?: number;
}
export interface DownloadImagesFromAdPageOptions {
    imageDownloadTimeout?: number;
}
type DownloadImagesController = Pick<WebReadController, "webFind" | "webFindAll">;
export declare function downloadAndSaveImage(url: string, directory: string, filenamePrefix: string, imageNumber: number, { timeout }?: DownloadImageOptions): Promise<string | null>;
export declare function downloadImagesFromAdPage(controller: DownloadImagesController, downloadImage: DownloadImage, directory: string, adFileStem: string, { imageDownloadTimeout }?: DownloadImagesFromAdPageOptions): Promise<string[]>;
export {};
