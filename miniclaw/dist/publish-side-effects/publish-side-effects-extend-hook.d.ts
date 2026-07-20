import { type ExtendAdContext } from "../extend-orchestration.js";
import { By, type WebElement, type WebLocator } from "../web-primitives.js";
interface ExtendPublishedAdController {
    webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
    webFind(type: By, value: string, options?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<WebLocator>;
    webFindAll(type: By, value: string, options?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<WebElement[]>;
    webOpen(url: string): Promise<void>;
    webSleep(minMs?: number, maxMs?: number): Promise<void>;
}
export declare function extendPublishedAd(controller: ExtendPublishedAdController, rootUrl: string, context: ExtendAdContext, { paginationFollowUpTimeout, paginationInitialTimeout, quickDomTimeout, }?: {
    paginationFollowUpTimeout?: number;
    paginationInitialTimeout?: number;
    quickDomTimeout?: number;
}): Promise<boolean>;
export {};
