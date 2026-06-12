import { By, type WebElement, type WebLocator } from "../web-primitives.js";
interface AdOverviewController {
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
export declare function navigatePaginatedAdOverview(controller: AdOverviewController, pageUrl: string, pageAction: (pageNumber: number) => Promise<boolean>, { maxPages, paginationFollowUpTimeout, paginationInitialTimeout, }?: {
    maxPages?: number;
    paginationFollowUpTimeout?: number;
    paginationInitialTimeout?: number;
}): Promise<boolean>;
export declare function extractOwnAdUrls(controller: AdOverviewController, rootUrl: string, { paginationFollowUpTimeout, paginationInitialTimeout, }?: {
    paginationFollowUpTimeout?: number;
    paginationInitialTimeout?: number;
}): Promise<string[]>;
export {};
