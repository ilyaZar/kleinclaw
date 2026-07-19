import { type ContactInput } from "../model/ad-model.js";
import { type WebReadController } from "./controller.js";
type ContactController = Pick<WebReadController, "webFind" | "webText">;
export declare function extractSellDirectlyFromAdPage(pageUrl: string, publishedAdsById: ReadonlyMap<number, unknown>): boolean | null;
export declare function extractContactFromAdPage(controller: ContactController): Promise<ContactInput>;
export {};
