/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type Ad, type AdUpdateStrategy } from "../model/ad-model.js";
import {
  type By,
  type Is,
  type WebElement,
  type WebLocator,
} from "../web-primitives.js";

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

export interface PublishingFormController {
  webCheck(type: By, value: string, attr: Is, timeout?: number): Promise<boolean>;
  webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
  webExecute(jscode: string): Promise<unknown>;
  webFind(
    type: By,
    value: string,
    options?: { timeout?: number },
  ): Promise<WebLocator>;
  webFindAll(
    type: By,
    value: string,
    options?: { timeout?: number },
  ): Promise<WebElement[]>;
  webInput(type: By, value: string, text: string, timeout?: number): Promise<WebLocator>;
  webOpen(
    url: string,
    options?: { timeout?: number; reloadIfAlreadyOpen?: boolean },
  ): Promise<void>;
  webProbe(
    type: By,
    value: string,
    options?: { timeout?: number },
  ): Promise<WebLocator | null>;
  webSelect(type: By, value: string, selectedValue: string, timeout?: number): Promise<WebLocator>;
  webSelectButtonCombobox(
    elementId: string,
    selectedValue: string,
    timeout?: number,
  ): Promise<WebElement>;
  webSelectCombobox(
    type: By,
    value: string,
    selectedValue: string,
    timeout?: number,
  ): Promise<WebElement>;
  webSleep(minMs?: number, maxMs?: number): Promise<void>;
}

export interface PublishingFormOptions {
  quickDomTimeout?: number;
}

export interface SetSpecialAttributesOptions {
  setCondition?: (conditionValue: string) => Promise<boolean>;
}

export interface SetCategoryOptions extends PublishingFormOptions {
  adFile: string;
  category: string | null;
  rootUrl: string;
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
  pageContext?: string;
  restartDelaySeconds?: number | null;
  scrollPageDown?: () => Promise<void>;
}

export interface SubmitAdOptions {
  confirmationTimeout?: number;
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
