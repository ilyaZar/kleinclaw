import { type AdInput } from "../model/ad-model.js";
import { type Config } from "../model/config-model.js";
import { By, type WebResponse } from "../web-primitives.js";
interface PricingShippingController {
    webText(type: By, value: string): Promise<string>;
    webRequest(url: string, method?: string, validResponseCodes?: number | Iterable<number>, headers?: Record<string, string> | null): Promise<WebResponse>;
}
export declare function extractPricingInfoFromAdPage(controller: PricingShippingController): Promise<[
    AdInput["price"],
    NonNullable<AdInput["price_type"]>
]>;
export declare function extractShippingInfoFromAdPage(config: Config, controller: PricingShippingController): Promise<[
    NonNullable<AdInput["shipping_type"]>,
    number | null,
    string[] | null
]>;
export {};
