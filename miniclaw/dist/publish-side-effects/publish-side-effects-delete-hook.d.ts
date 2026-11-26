import { type Ad } from "../model/ad-model.js";
import { type DeleteAdHook } from "../publish-orchestration.js";
import { type WebResponse } from "../web-primitives.js";
interface DeletePublishedAdController {
    webExecute(jscode: string): Promise<unknown>;
    webOpen(url: string): Promise<void>;
    webRequest(url: string, method?: string, validResponseCodes?: number | Iterable<number>, headers?: Record<string, string> | null): Promise<WebResponse>;
    webSleep(minMs?: number, maxMs?: number): Promise<void>;
}
export declare function deletionTargetIds(ad: Pick<Ad, "id" | "title">, publishedAds: readonly Record<string, unknown>[], deleteOldAdsByTitle: boolean): number[];
export declare function deletePublishedAd(controller: DeletePublishedAdController, rootUrl: string, { ad, deleteOldAdsByTitle, publishedAds, }: Parameters<DeleteAdHook>[0]): Promise<boolean>;
export {};
