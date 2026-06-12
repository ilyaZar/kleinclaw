import { type Ad } from "../model/ad-model.js";
import { type PublishingFormController, type PublishingFormOptions, type ShippingType } from "./types.js";
export declare function publishingDescription(ad: Pick<Ad, "description" | "descriptionPrefix" | "descriptionSuffix">, { withAffixes }?: {
    withAffixes?: boolean;
}): string;
export declare function setFrameworkInputValue(controller: Pick<PublishingFormController, "webFind" | "webExecute">, elementId: string, value: string): Promise<void>;
export declare function selectWantedShipping(controller: Pick<PublishingFormController, "webFind" | "webSelectButtonCombobox">, shippingType: ShippingType, { quickDomTimeout }?: PublishingFormOptions): Promise<boolean>;
export declare function configurePriceFields(controller: Pick<PublishingFormController, "webClick" | "webExecute" | "webFind">, ad: Pick<Ad, "price" | "priceType">): Promise<void>;
export declare function configureSellDirectly(controller: Pick<PublishingFormController, "webCheck" | "webClick" | "webProbe">, ad: Pick<Ad, "priceType" | "sellDirectly" | "shippingType" | "type">, { quickDomTimeout }?: PublishingFormOptions): Promise<void>;
export declare function setDescriptionField(controller: Pick<PublishingFormController, "webFind" | "webExecute">, ad: Pick<Ad, "description" | "descriptionPrefix" | "descriptionSuffix">): Promise<void>;
export declare function setDeferredTitleField(controller: Pick<PublishingFormController, "webFind" | "webExecute">, ad: Pick<Ad, "title">): Promise<void>;
