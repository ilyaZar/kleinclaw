import { By, type WebElement, type WebLocator } from "../web-primitives.js";
export type DownloadImage = (url: string, directory: string, filenamePrefix: string, imageNumber: number) => Promise<string | null> | string | null;
interface DownloadImagesController {
    webFind(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<WebLocator>;
    webFindAll(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<WebElement[]>;
}
export declare function downloadAndSaveImage(url: string, directory: string, filenamePrefix: string, imageNumber: number): Promise<string | null>;
export declare function downloadImagesFromAdPage(controller: DownloadImagesController, downloadImage: DownloadImage, directory: string, adFileStem: string): Promise<string[]>;
export {};
