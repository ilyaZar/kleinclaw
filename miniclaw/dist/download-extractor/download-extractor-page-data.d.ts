import { type WebElement, type WebResponse } from "../web-primitives.js";
export interface ShippingOption {
    id: string;
    packageSize: string;
    priceInEuroCent: number;
}
export declare function dimensionsFromBelenConf(value: unknown): Record<string, unknown>;
export declare function textAttribute(value: unknown, name: string): string | null;
export declare function visibleText(element: WebElement): Promise<string>;
export declare function removeSuffix(value: string, suffix: string): string;
export declare function parseGermanDecimal(value: string): number;
export declare function parseGermanCreationDate(value: string): string;
export declare function parsePriceAmount(value: string): number;
export declare function shippingOptionsFromResponse(response: WebResponse): ShippingOption[];
export declare function translateDamageAttribute(value: string): string;
