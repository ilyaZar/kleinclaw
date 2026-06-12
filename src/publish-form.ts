/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  AdUpdateStrategy,
  type Ad,
} from "./model/ad-model.js";
import { By } from "./web-primitives.js";
import {
  setCategory,
} from "./publish-form/category-selection.js";
import {
  configurePriceFields,
  configureSellDirectly,
  selectWantedShipping,
  setDeferredTitleField,
  setDescriptionField,
} from "./publish-form/core-fields.js";
import {
  setContactFields,
} from "./publish-form/contact-fields.js";
import {
  cleanupExistingImages,
  uploadImages,
} from "./publish-form/image-upload.js";
import {
  updateAdConfigAfterPublish,
} from "./publish-form/metadata.js";
import {
  setSpecialAttributes,
} from "./publish-form/special-attributes.js";
import {
  setShipping,
} from "./publish-form/shipping-fields.js";
import {
  checkAndWaitForCaptcha,
  submitAdForm,
} from "./publish-form/submit-flow.js";
import {
  type PublishAdFormAd,
  type PublishAdFormOptions,
  type PublishAdFormResult,
  type PublishingFormController,
  type PublishingFormOptions,
} from "./publish-form/types.js";

export {
  CaptchaEncountered,
  CategoryResolutionError,
  PublishSubmissionUncertainError,
} from "./publish-form/errors.js";
export {
  CAPTCHA_IFRAME_SELECTOR,
  CATEGORY_CHANGE_CONTROL_XPATH,
  CATEGORY_NEXT_BUTTON_XPATH,
  CATEGORY_PICKER_RADIO_SELECTOR,
  CITY_LISTBOX_ID_FALLBACK,
  CITY_SELECTED_OPTION_ID,
  CONDITION_GERMAN_TO_API,
  CONDITION_TRIGGER_XPATH,
  CONFIRMATION_URL_FRAGMENT,
  IMAGE_FILE_INPUT_SELECTOR,
  IMAGE_MARKER_SELECTOR,
  IMAGE_REMOVE_BUTTON_SELECTOR,
  IMPRINT_GUIDANCE_SUBMIT_ID,
  NO_IMAGE_HINT_BUTTON_XPATH,
  PAYMENT_FORM_ID,
  SHIPPING_BACK_BUTTON_XPATH,
  SHIPPING_DIALOG_DONE_BUTTON_XPATH,
  SHIPPING_DIALOG_NEXT_BUTTON_XPATH,
  SHIPPING_DIALOG_XPATH,
  SHIPPING_DONE_BUTTON_XPATH,
  SHIPPING_OTHER_METHODS_BUTTON_XPATH,
  SUBMIT_BUTTON_XPATH,
  TRACKING_SCRIPT_TEXT_JS,
  WANTED_SHIPPING_LABELS,
} from "./publish-form/constants.js";
export {
  configurePriceFields,
  configureSellDirectly,
  publishingDescription,
  selectWantedShipping,
  setDeferredTitleField,
  setDescriptionField,
  setFrameworkInputValue,
} from "./publish-form/core-fields.js";
export {
  setShipping,
  setShippingOptions,
  shippingCostInputValue,
  shippingOptionCarrierCodes,
} from "./publish-form/shipping-fields.js";
export {
  resolveCategorySuggestions,
  setCategory,
} from "./publish-form/category-selection.js";
export {
  cityListboxOptionSelector,
  locationMatchesTarget,
  readCitySelectionText,
  selectCityComboboxOption,
  setContactFields,
  setContactLocation,
} from "./publish-form/contact-fields.js";
export {
  inspectSpecialAttributeElement,
  type SpecialAttributeElementInfo,
  xpathLiteral,
} from "./publish-form/element-helpers.js";
export {
  conditionCandidateValues,
  normalizeSpecialAttributeKey,
  pickSpecialAttributeCandidate,
  setConditionDialog,
  setSpecialAttributes,
  specialAttributeCandidatePriority,
  specialAttributeXPath,
} from "./publish-form/special-attributes.js";
export {
  cleanupExistingImages,
  imageMarkerValue,
  uploadImages,
} from "./publish-form/image-upload.js";
export {
  updateAdConfigAfterPublish,
} from "./publish-form/metadata.js";
export {
  checkAndWaitForCaptcha,
  checkPublishingResult,
  parseConfirmationAdId,
  recoverAdIdFromRedirect,
  submitAdForm,
} from "./publish-form/submit-flow.js";
export {
  type CaptchaOptions,
  type PriceType,
  type PublishAdFormAd,
  type PublishAdFormOptions,
  type PublishAdFormResult,
  type PublishingContact,
  type PublishingFormController,
  type PublishingFormOptions,
  type PublishingImagesAd,
  type PublishingShippingAd,
  type SetCategoryOptions,
  type SetShippingOptions,
  type SetSpecialAttributesOptions,
  type ShippingType,
  type SubmitAdOptions,
  type UploadImagesOptions,
} from "./publish-form/types.js";

function publishFormUrl(
  rootUrl: string,
  ad: Pick<PublishAdFormAd, "id">,
  mode: AdUpdateStrategy,
): string {
  if (mode === AdUpdateStrategy.Modify) {
    return `${rootUrl}/p-anzeige-bearbeiten.html?adId=${ad.id}`;
  }
  return `${rootUrl}/p-anzeige-aufgeben-schritt2.html`;
}

export async function publishAdForm(
  controller: PublishingFormController,
  ad: PublishAdFormAd,
  {
    adConfig,
    adFile,
    autoRestart,
    captchaDetectionTimeout,
    confirmationTimeout,
    dismissConsentBanner,
    imageUploadTimeout,
    mode = AdUpdateStrategy.Replace,
    now = () => new Date(),
    onManualCaptcha,
    onPaymentForm,
    quickDomTimeout,
    recoverAdId,
    restartDelaySeconds,
    rootUrl,
    saveAdConfig,
    scrollPageDown,
    waitForConfirmation,
    waitForImageUpload,
  }: PublishAdFormOptions,
): Promise<PublishAdFormResult> {
  await controller.webOpen(
    publishFormUrl(rootUrl, ad, mode),
    { reloadIfAlreadyOpen: true },
  );
  if (dismissConsentBanner) {
    await dismissConsentBanner();
  }

  if (ad.type === "WANTED") {
    await controller.webClick(By.ID, "ad-type-WANTED");
  }

  await setCategory(controller, {
    adFile,
    category: ad.category,
    quickDomTimeout,
    rootUrl,
  });
  await controller.webSleep();
  await setSpecialAttributes(controller, ad.specialAttributes);

  if (ad.shippingType !== "NOT_APPLICABLE") {
    if (ad.type === "WANTED") {
      await selectWantedShipping(controller, ad.shippingType, { quickDomTimeout });
    } else {
      await setShipping(controller, ad, { mode, quickDomTimeout });
    }
  }

  await configurePriceFields(controller, ad);
  await configureSellDirectly(controller, ad, { quickDomTimeout });
  await setDescriptionField(controller, ad);
  await setContactFields(controller, ad.contact, { quickDomTimeout });

  const removedImageCount = await cleanupExistingImages(controller, {
    quickDomTimeout,
  });
  await uploadImages(controller, ad, {
    imageUploadTimeout,
    quickDomTimeout,
    waitForImageUpload,
  });

  await checkAndWaitForCaptcha(controller, {
    autoRestart,
    captchaDetectionTimeout,
    isLoginPage: false,
    onManualCaptcha,
    restartDelaySeconds,
    scrollPageDown,
  });

  await setDeferredTitleField(controller, ad);
  const adId = await submitAdForm(controller, ad, {
    confirmationTimeout,
    onPaymentForm,
    quickDomTimeout,
    recoverAdId,
    waitForConfirmation,
  });

  if (adConfig) {
    updateAdConfigAfterPublish(adConfig, ad, adId, mode, now());
    if (saveAdConfig) {
      await saveAdConfig(adFile, adConfig);
    }
  } else if (saveAdConfig) {
    throw new Error("adConfig must be provided when saveAdConfig is configured");
  }

  return { adConfig, adId, removedImageCount };
}

export async function fillCorePublishFormFields(
  controller: PublishingFormController,
  ad: Pick<
    Ad,
    | "description"
    | "descriptionPrefix"
    | "descriptionSuffix"
    | "price"
    | "priceType"
    | "sellDirectly"
    | "shippingCosts"
    | "shippingOptions"
    | "shippingType"
    | "type"
  >,
  options: PublishingFormOptions = {},
): Promise<void> {
  if (ad.type === "WANTED") {
    await controller.webClick(By.ID, "ad-type-WANTED");
    await selectWantedShipping(controller, ad.shippingType, options);
  } else {
    await setShipping(controller, ad, options);
  }

  await configurePriceFields(controller, ad);
  await configureSellDirectly(controller, ad, options);
  await setDescriptionField(controller, ad);
}
