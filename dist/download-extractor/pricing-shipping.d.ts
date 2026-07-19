import { type AdInput } from "../model/ad-model.js";
import { type Config } from "../model/config-model.js";
import { type WebReadController } from "./controller.js";
type PricingShippingController = Pick<WebReadController, "webRequest" | "webText">;
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
