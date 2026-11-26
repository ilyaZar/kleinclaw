import { type AdInput } from "../model/ad-model.js";
import { type Config } from "../model/config-model.js";
import { type WebReadController } from "./download-extractor-controller.js";
type PricingShippingController = Pick<WebReadController, "webProbe" | "webRequest" | "webText">;
export declare function extractPricingInfoFromAdPage(controller: PricingShippingController, islandPrice?: [number | null, string] | null): Promise<[
    AdInput["price"],
    NonNullable<AdInput["price_type"]>
]>;
export declare function extractShippingInfoFromAdPage(config: Config, controller: PricingShippingController, islandShippingText?: string | null): Promise<[
    NonNullable<AdInput["shipping_type"]>,
    number | null,
    string[] | null
]>;
export {};
