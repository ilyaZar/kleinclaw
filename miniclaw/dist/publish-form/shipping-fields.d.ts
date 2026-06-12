import { type PublishingFormController, type PublishingShippingAd, type SetShippingOptions } from "./types.js";
export declare function shippingCostInputValue(value: number | string): string;
export declare function shippingOptionCarrierCodes(options: string[]): string[];
export declare function setShippingOptions(controller: Pick<PublishingFormController, "webClick" | "webFind" | "webSleep">, ad: Pick<PublishingShippingAd, "shippingOptions">, { quickDomTimeout }?: SetShippingOptions): Promise<void>;
export declare function setShipping(controller: Pick<PublishingFormController, "webCheck" | "webClick" | "webExecute" | "webFind" | "webProbe" | "webSleep">, ad: PublishingShippingAd, { mode, quickDomTimeout, }?: SetShippingOptions): Promise<void>;
