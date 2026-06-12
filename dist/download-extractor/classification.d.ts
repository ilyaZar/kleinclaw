import { By, type WebElement, type WebLocator } from "../web-primitives.js";
interface ClassificationController {
    webFind(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<WebLocator>;
    webFindAll(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<WebElement[]>;
    webText(type: By, value: string, options?: {
        parent?: WebLocator | WebElement | null;
        timeout?: number;
    }): Promise<string>;
}
export declare function extractCategoryFromAdPage(controller: ClassificationController): Promise<string>;
export declare function extractSpecialAttributesFromAdPage(controller: ClassificationController, belenConf: unknown): Promise<Record<string, string>>;
export declare function extractSpecialAttributesFromDom(controller: ClassificationController): Promise<Record<string, string>>;
export {};
