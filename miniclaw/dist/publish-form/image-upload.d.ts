import { type WebElement } from "../web-primitives.js";
import { type PublishingFormController, type PublishingFormOptions, type PublishingImagesAd, type UploadImagesOptions } from "./types.js";
export declare function imageMarkerValue(marker: WebElement): Promise<string>;
export declare function uploadImages(controller: Pick<PublishingFormController, "webFind" | "webFindAll" | "webSleep">, ad: PublishingImagesAd, { imageUploadTimeout, quickDomTimeout, waitForImageUpload, }?: UploadImagesOptions): Promise<void>;
export declare function cleanupExistingImages(controller: Pick<PublishingFormController, "webFindAll" | "webProbe" | "webSleep">, { quickDomTimeout }?: PublishingFormOptions): Promise<number>;
