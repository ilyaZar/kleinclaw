/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type Ad, type AdUpdateStrategy } from "../model/ad-model.js";
import { type WebController } from "../web-primitives.js";

export type PriceType = Ad["priceType"];
export type ShippingType = Ad["shippingType"];
export type PublishingContact = {
  location?: string | null;
  name?: string | null;
  phone?: string | null;
  street?: string | null;
  zipcode?: number | string | null;
};
export type PublishingShippingAd = Pick<
  Ad,
  "shippingCosts" | "shippingOptions" | "shippingType"
>;
export type PublishingImagesAd = Pick<Ad, "images">;
export type PublishAdFormAd = Pick<
  Ad,
  | "category"
  | "contact"
  | "createdOn"
  | "description"
  | "descriptionPrefix"
  | "descriptionSuffix"
  | "id"
  | "images"
  | "price"
  | "priceReductionCount"
  | "priceType"
  | "repostCount"
  | "sellDirectly"
  | "shippingCosts"
  | "shippingOptions"
  | "shippingType"
  | "specialAttributes"
  | "title"
  | "type"
>;

export type PublishingFormController = Pick<
  WebController,
  | "webCheck"
  | "webClick"
  | "webExecute"
  | "webFind"
  | "webFindAll"
  | "webInput"
  | "webOpen"
  | "webProbe"
  | "webSelect"
  | "webSelectButtonCombobox"
  | "webSelectCombobox"
  | "webSleep"
>;

export interface PublishingFormOptions {
  quickDomTimeout?: number;
}

export interface SetSpecialAttributesOptions {
  setCondition?: (conditionValue: string) => Promise<boolean>;
}

export interface SetCategoryOptions extends PublishingFormOptions {
  adFile: string;
  category: string | null;
  productTitle?: string | null;
}

export interface SetShippingOptions extends PublishingFormOptions {
  mode?: AdUpdateStrategy;
}

export interface UploadImagesOptions extends PublishingFormOptions {
  imageUploadTimeout?: number;
  waitForImageUpload?: (
    condition: () => Promise<boolean>,
    options: { timeout?: number; timeoutErrorMessage: string },
  ) => Promise<void>;
}

export interface CaptchaOptions {
  autoRestart?: boolean;
  captchaDetectionTimeout?: number;
  isLoginPage?: boolean;
  onManualCaptcha?: () => Promise<void>;
  restartDelaySeconds?: number | null;
  scrollPageDown?: () => Promise<void>;
}

export interface SubmitAdOptions {
  // the ad's current ID; an update success page carries none
  configuredAdId?: number | null;
  confirmationTimeout?: number;
  mode?: AdUpdateStrategy;
  // ID of a publish whose success page showed none
  recoverIdlessAdId?: () => Promise<number | null>;
  rootUrl?: string;
  onPaymentForm?: () => Promise<void>;
  quickDomTimeout?: number;
  recoverAdId?: () => Promise<number | null>;
  waitForConfirmation?: (
    condition: () => Promise<boolean>,
    options: { timeout?: number },
  ) => Promise<void>;
}

export interface PublishAdFormOptions
  extends UploadImagesOptions, CaptchaOptions, SubmitAdOptions {
  adConfig?: Record<string, unknown>;
  adFile: string;
  dismissConsentBanner?: () => Promise<void>;
  mode?: AdUpdateStrategy;
  now?: () => Date;
  rootUrl: string;
  saveAdConfig?: (
    adFile: string,
    adConfig: Record<string, unknown>,
  ) => Promise<void>;
}

export interface PublishAdFormResult {
  adConfig?: Record<string, unknown>;
  adId: number;
  removedImageCount: number;
}
