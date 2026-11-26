import { type ContactInput } from "../model/ad-model.js";
import { type WebReadController } from "./download-extractor-controller.js";
type ContactController = Pick<WebReadController, "webFind" | "webProbe" | "webText">;
export declare function extractSellDirectlyFromAdPage(pageUrl: string, publishedAdsById: ReadonlyMap<number, unknown>): boolean | null;
export declare function extractContactFromAdPage(controller: ContactController, islandContactName?: string | null): Promise<ContactInput>;
export {};
