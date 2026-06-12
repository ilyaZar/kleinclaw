import { type DeleteAdHook } from "../publish-orchestration.js";
import { By, type WebElement, type WebResponse } from "../web-primitives.js";
interface DeletePublishedAdController {
    webFind(type: By, value: string): Promise<WebElement>;
    webOpen(url: string): Promise<void>;
    webRequest(url: string, method?: string, validResponseCodes?: number | Iterable<number>, headers?: Record<string, string> | null): Promise<WebResponse>;
    webSleep(minMs?: number, maxMs?: number): Promise<void>;
}
export declare function deletePublishedAd(controller: DeletePublishedAdController, rootUrl: string, { ad, deleteOldAdsByTitle, publishedAds, }: Parameters<DeleteAdHook>[0]): Promise<boolean>;
export {};
