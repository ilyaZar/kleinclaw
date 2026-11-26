import { type PublishingFormController, type PublishingShippingAd, type SetShippingOptions } from "./publish-form-types.js";
export declare function shippingOptionCarrierCodes(options: string[]): string[];
export declare function setShippingOptions(controller: Pick<PublishingFormController, "webClick" | "webFind" | "webSleep">, ad: Pick<PublishingShippingAd, "shippingOptions">, { quickDomTimeout }?: SetShippingOptions): Promise<void>;
export declare function openShippingSizeSelection(controller: Pick<PublishingFormController, "webProbe" | "webSleep">, quickDomTimeout?: number): Promise<void>;
export declare function findVersandCombobox(controller: Pick<PublishingFormController, "webProbe">, quickDomTimeout?: number): Promise<string | null>;
export declare function setShipping(controller: Pick<PublishingFormController, "webCheck" | "webClick" | "webFind" | "webProbe" | "webSelectButtonCombobox" | "webSleep">, ad: PublishingShippingAd, { quickDomTimeout }?: SetShippingOptions): Promise<void>;
