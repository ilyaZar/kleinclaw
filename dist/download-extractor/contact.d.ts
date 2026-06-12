import { type ContactInput } from "../model/ad-model.js";
import { By, type WebElement, type WebLocator } from "../web-primitives.js";
interface ContactController {
    webFind(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<WebLocator>;
    webText(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<string>;
}
export declare function extractSellDirectlyFromAdPage(pageUrl: string, publishedAdsById: ReadonlyMap<number, unknown>): boolean | null;
export declare function extractContactFromAdPage(controller: ContactController): Promise<ContactInput>;
export {};
