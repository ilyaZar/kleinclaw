/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { MAX_DESCRIPTION_LENGTH, type Ad } from "../model/ad-model.js";
import { By, Is, TimeoutError } from "../web-primitives.js";
import { WANTED_SHIPPING_LABELS } from "./constants.js";
import {
  type PriceType,
  type PublishingFormController,
  type PublishingFormOptions,
  type ShippingType,
} from "./types.js";

const PRICE_TYPE_OPTION_INDEX: Record<
  Exclude<PriceType, "NOT_APPLICABLE">,
  number
> = {
  FIXED: 0,
  NEGOTIABLE: 1,
  GIVE_AWAY: 2,
};

export function publishingDescription(
  ad: Pick<Ad, "description" | "descriptionPrefix" | "descriptionSuffix">,
  { withAffixes = true }: { withAffixes?: boolean } = {},
): string {
  const rawDescription =
    `${ad.descriptionPrefix}${ad.description}${ad.descriptionSuffix}`;
  const description = withAffixes
    ? rawDescription.replaceAll("@", "(at)")
    : ad.description;

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      "Length of ad description including prefix and suffix exceeds " +
      `${MAX_DESCRIPTION_LENGTH} chars. Description length: ${description.length} chars.`,
    );
  }
  return description;
}

export async function setFrameworkInputValue(
  controller: Pick<PublishingFormController, "webFind" | "webExecute">,
  elementId: string,
  value: string,
): Promise<void> {
  await controller.webFind(By.ID, elementId);
  const jsElementId = JSON.stringify(elementId);
  const jsValue = JSON.stringify(value);
  await controller.webExecute(
    `(function(id,v){` +
    "var el=document.getElementById(id);" +
    "if(!el)return;" +
    "var tag=el.tagName.toLowerCase();" +
    "var proto=tag==='textarea'?window.HTMLTextAreaElement:window.HTMLInputElement;" +
    "var setter=Object.getOwnPropertyDescriptor(proto.prototype,'value').set;" +
    "setter.call(el,v);" +
    "el.dispatchEvent(new Event('input',{bubbles:true}));" +
    "el.dispatchEvent(new Event('change',{bubbles:true}));" +
    `})(${jsElementId},${jsValue})`,
  );
}

export async function selectWantedShipping(
  controller: Pick<
    PublishingFormController,
    "webFind" | "webSelectButtonCombobox"
  >,
  shippingType: ShippingType,
  { quickDomTimeout }: PublishingFormOptions = {},
): Promise<boolean> {
  if (shippingType === "NOT_APPLICABLE") {
    return false;
  }

  const displayText = WANTED_SHIPPING_LABELS[shippingType];
  try {
    const shippingButton = await controller.webFind(
      By.CSS_SELECTOR,
      '[role="combobox"][id$=".versand"]',
      { timeout: quickDomTimeout },
    );
    const buttonId = await shippingButton.getAttribute?.("id");
    if (!buttonId) {
      throw new TimeoutError("Shipping combobox button has no id attribute");
    }
    await controller.webSelectButtonCombobox(
      buttonId,
      displayText,
      quickDomTimeout,
    );
    return true;
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new TimeoutError(
        `Failed to set shipping attribute for type '${shippingType}'!`,
      );
    }
    throw error;
  }
}

export async function configurePriceFields(
  controller: Pick<
    PublishingFormController,
    "webClick" | "webExecute" | "webFind"
  >,
  ad: Pick<Ad, "price" | "priceType">,
): Promise<void> {
  if (ad.priceType === "NOT_APPLICABLE") {
    return;
  }

  try {
    await controller.webClick(By.ID, "ad-price-type");
    await controller.webClick(
      By.ID,
      `ad-price-type-menu-option-${PRICE_TYPE_OPTION_INDEX[ad.priceType]}`,
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new TimeoutError(`Failed to set price type '${ad.priceType}'`);
    }
    throw error;
  }

  if (ad.price !== null) {
    await setFrameworkInputValue(
      controller,
      "ad-price-amount",
      String(ad.price),
    );
  }
}

export async function configureSellDirectly(
  controller: Pick<
    PublishingFormController,
    "webCheck" | "webClick" | "webProbe"
  >,
  ad: Pick<Ad, "priceType" | "sellDirectly" | "shippingType" | "type">,
  { quickDomTimeout }: PublishingFormOptions = {},
): Promise<void> {
  if (ad.type === "WANTED") {
    return;
  }

  if (
    ad.shippingType === "SHIPPING" &&
    ad.sellDirectly &&
    (ad.priceType === "FIXED" || ad.priceType === "NEGOTIABLE")
  ) {
    const buyNowTrue = await controller.webProbe(By.ID, "ad-buy-now-true", {
      timeout: quickDomTimeout,
    });
    if (buyNowTrue === null) {
      throw new TimeoutError(
        "Failed to enable direct-buy option: required control is not available.",
      );
    }
    const isSelected = await controller.webCheck(
      By.ID,
      "ad-buy-now-true",
      Is.SELECTED,
      quickDomTimeout,
    );
    if (!isSelected) {
      await controller.webClick(By.ID, "ad-buy-now-true", quickDomTimeout);
    }
    return;
  }

  const buyNowFalse = await controller.webProbe(By.ID, "ad-buy-now-false", {
    timeout: quickDomTimeout,
  });
  const shouldSelectFalse = buyNowFalse !== null &&
    !await controller.webCheck(
      By.ID,
      "ad-buy-now-false",
      Is.SELECTED,
      quickDomTimeout,
    );
  if (shouldSelectFalse) {
    await controller.webClick(By.ID, "ad-buy-now-false", quickDomTimeout);
  }
}

export async function setDescriptionField(
  controller: Pick<PublishingFormController, "webFind" | "webExecute">,
  ad: Pick<Ad, "description" | "descriptionPrefix" | "descriptionSuffix">,
): Promise<void> {
  await setFrameworkInputValue(
    controller,
    "ad-description",
    publishingDescription(ad, { withAffixes: true }),
  );
}

export async function setDeferredTitleField(
  controller: Pick<PublishingFormController, "webFind" | "webExecute">,
  ad: Pick<Ad, "title">,
): Promise<void> {
  await setFrameworkInputValue(controller, "ad-title", ad.title);
}
