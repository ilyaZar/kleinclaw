/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  CARRIER_CODE_BY_OPTION,
  CARRIER_CODES_BY_SIZE,
  SIZE_INFO_BY_CARRIER_CODE,
} from "../model/ad-model.js";
import { By, Is, TimeoutError } from "../web-primitives.js";
import {
  SHIPPING_BACK_BUTTON_XPATH,
  SHIPPING_DIALOG_DONE_BUTTON_XPATH,
  SHIPPING_DIALOG_NEXT_BUTTON_XPATH,
  SHIPPING_DIALOG_XPATH,
  SHIPPING_OTHER_METHODS_XPATH,
  VERSAND_COMBOBOX_SELECTORS,
  WANTED_SHIPPING_LABELS,
} from "./publish-form-constants.js";
import {
  clickElement,
  elementAttribute,
  elementHasAttribute,
  xpathLiteral,
} from "./publish-form-element-helpers.js";
import {
  type PublishingFormController,
  type PublishingShippingAd,
  type SetShippingOptions,
} from "./publish-form-types.js";

const SHIPPING_SIZE_RADIO_VALUES = ["SMALL", "MEDIUM", "LARGE"];

function shippingSizeRadioXPath(radioValue: string): string {
  return (
    `${SHIPPING_DIALOG_XPATH}//input` +
    `[@type="radio" and @value=${xpathLiteral(radioValue)}]`
  );
}

function shippingCarrierCheckboxXPath(carrierCode: string): string {
  return (
    `${SHIPPING_DIALOG_XPATH}//input` +
    `[@type="checkbox" and @value=${xpathLiteral(carrierCode)}]`
  );
}

async function withTimeoutMessage<T>(
  action: () => Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new TimeoutError(message);
    }
    throw error;
  }
}

async function enableShippingIfAvailable(
  controller: Pick<PublishingFormController, "webClick" | "webSleep">,
  quickDomTimeout?: number,
): Promise<void> {
  try {
    await controller.webClick(By.ID, "ad-shipping-enabled-yes", quickDomTimeout);
    await controller.webSleep(500, 800);
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }
}

async function setPickupShipping(
  controller: Pick<PublishingFormController, "webCheck" | "webClick" | "webProbe">,
  quickDomTimeout?: number,
): Promise<void> {
  const pickupRadio = await controller.webProbe(By.ID, "ad-shipping-enabled-no", {
    timeout: quickDomTimeout,
  });
  if (pickupRadio === null) {
    // Categories without shipping have no fieldset; a fieldset without the
    // radio means the page is not loaded yet.
    if (await controller.webProbe(By.ID, "ad-shipping-enabled", { timeout: quickDomTimeout })) {
      throw new TimeoutError(
        "Shipping fieldset is rendered, but the pickup radio is missing; page may not be fully loaded.",
      );
    }
    return;
  }

  await withTimeoutMessage(async () => {
    if (!await controller.webCheck(
      By.ID,
      "ad-shipping-enabled-no",
      Is.SELECTED,
      quickDomTimeout,
    )) {
      await controller.webClick(By.ID, "ad-shipping-enabled-no", quickDomTimeout);
    }
  }, "Failed to set shipping attribute for type 'PICKUP'!");
}

export function shippingOptionCarrierCodes(options: string[]): string[] {
  try {
    return [...new Set(options)].map((option) => {
      const carrierCode = CARRIER_CODE_BY_OPTION[option];
      if (!carrierCode) {
        throw new Error(option);
      }
      return carrierCode;
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        "Unknown shipping option(s), please refer to the documentation/README: " +
        options.join(","),
      );
    }
    throw error;
  }
}

function shippingSizeInfoForCarrierCodes(
  carrierCodes: string[],
): { carrierCodesForSize: string[]; radioValue: string } {
  const sizeKeys = new Set(
    carrierCodes.map((carrierCode) => {
      const [size, radioValue] = SIZE_INFO_BY_CARRIER_CODE[carrierCode] ?? [];
      return `${size}\u0000${radioValue}`;
    }),
  );
  if (sizeKeys.size !== 1) {
    throw new Error("You can only specify shipping options for one package size!");
  }

  const sizeKey = [...sizeKeys][0]!;
  const [size = "", radioValue = ""] = sizeKey.split("\u0000");
  const carrierCodesForSize = CARRIER_CODES_BY_SIZE[size];
  if (!carrierCodesForSize || !radioValue) {
    throw new Error("You can only specify shipping options for one package size!");
  }
  return {
    carrierCodesForSize,
    radioValue,
  };
}

export async function setShippingOptions(
  controller: Pick<PublishingFormController, "webClick" | "webFind" | "webSleep">,
  ad: Pick<PublishingShippingAd, "shippingOptions">,
  { quickDomTimeout }: SetShippingOptions = {},
): Promise<void> {
  if (!ad.shippingOptions || ad.shippingOptions.length === 0) {
    throw new Error("shipping_options must be provided");
  }

  const wantedCarrierCodes = shippingOptionCarrierCodes(ad.shippingOptions);
  const { carrierCodesForSize, radioValue } =
    shippingSizeInfoForCarrierCodes(wantedCarrierCodes);
  const wantedCodes = new Set(wantedCarrierCodes);
  const sizeRadioXPath = shippingSizeRadioXPath(radioValue);

  await withTimeoutMessage(async () => {
    const sizeRadio = await controller.webFind(
      By.XPATH,
      sizeRadioXPath,
      { timeout: quickDomTimeout },
    );
    if (!await elementHasAttribute(sizeRadio, "checked")) {
      await controller.webClick(By.XPATH, sizeRadioXPath, quickDomTimeout);
    }

    await controller.webSleep(300, 500);
    await controller.webClick(
      By.XPATH,
      SHIPPING_DIALOG_NEXT_BUTTON_XPATH,
      quickDomTimeout,
    );
    await controller.webSleep(500, 800);

    // Tick wanted carriers first: the dialog empties its carrier list as soon
    // as nothing is ticked.
    const ordered = [...carrierCodesForSize].sort((left, right) =>
      Number(!wantedCodes.has(left)) - Number(!wantedCodes.has(right)));
    for (const carrierCode of ordered) {
      const checkboxXPath = shippingCarrierCheckboxXPath(carrierCode);
      const checkbox = await controller.webFind(
        By.XPATH,
        checkboxXPath,
        { timeout: quickDomTimeout },
      );
      const isChecked = await elementHasAttribute(checkbox, "checked");
      const shouldBeChecked = wantedCodes.has(carrierCode);
      if (isChecked !== shouldBeChecked) {
        await controller.webClick(By.XPATH, checkboxXPath, quickDomTimeout);
      }
    }
  }, "Failed to configure shipping options in dialog!");

  await withTimeoutMessage(
    () => controller.webClick(
      By.XPATH,
      SHIPPING_DIALOG_DONE_BUTTON_XPATH,
      quickDomTimeout,
    ),
    "Unable to close shipping dialog!",
  );
}

async function shippingSizeRadioVisible(
  controller: Pick<PublishingFormController, "webProbe">,
  quickDomTimeout?: number,
): Promise<boolean> {
  for (const size of SHIPPING_SIZE_RADIO_VALUES) {
    if (await controller.webProbe(By.XPATH, shippingSizeRadioXPath(size), {
      timeout: quickDomTimeout,
    })) {
      return true;
    }
  }
  return false;
}

// Reach the package-size pane across dialog variants: it may be shown
// directly, sit behind "Andere Versandmethoden" (any element), or need at
// most two "Zurück" steps out of a nested carrier pane.
export async function openShippingSizeSelection(
  controller: Pick<PublishingFormController, "webProbe" | "webSleep">,
  quickDomTimeout?: number,
): Promise<void> {
  const maxBackSteps = 2;
  for (let backSteps = 0; backSteps <= maxBackSteps; backSteps += 1) {
    if (await shippingSizeRadioVisible(controller, quickDomTimeout)) {
      return;
    }
    const otherMethods = await controller.webProbe(By.XPATH, SHIPPING_OTHER_METHODS_XPATH, {
      timeout: quickDomTimeout,
    });
    if (otherMethods) {
      await clickElement(otherMethods, "Failed to configure shipping options in dialog!");
      await controller.webSleep(300, 500);
      if (await shippingSizeRadioVisible(controller, quickDomTimeout)) {
        return;
      }
    }
    if (backSteps === maxBackSteps) {
      break;
    }
    const back = await controller.webProbe(By.XPATH, SHIPPING_BACK_BUTTON_XPATH, {
      timeout: quickDomTimeout,
    });
    if (!back) {
      break;
    }
    await clickElement(back, "Failed to configure shipping options in dialog!");
    await controller.webSleep(300, 500);
  }
  throw new TimeoutError("Failed to configure shipping options in dialog!");
}

export async function findVersandCombobox(
  controller: Pick<PublishingFormController, "webProbe">,
  quickDomTimeout?: number,
): Promise<string | null> {
  for (const selector of VERSAND_COMBOBOX_SELECTORS) {
    const element = await controller.webProbe(By.CSS_SELECTOR, selector, {
      timeout: quickDomTimeout,
    });
    if (element) {
      const id = await elementAttribute(element, "id");
      if (typeof id !== "string" || !id) {
        throw new TimeoutError("Shipping combobox button has no id attribute");
      }
      return id;
    }
  }
  return null;
}

export async function setShipping(
  controller: Pick<
    PublishingFormController,
    | "webCheck"
    | "webClick"
    | "webFind"
    | "webProbe"
    | "webSelectButtonCombobox"
    | "webSleep"
  >,
  ad: PublishingShippingAd,
  { quickDomTimeout }: SetShippingOptions = {},
): Promise<void> {
  if (ad.shippingType === "NOT_APPLICABLE") {
    return;
  }

  // PRO accounts choose shipping through a "Versand" combobox.
  const versandId = await findVersandCombobox(controller, quickDomTimeout);
  if (versandId) {
    await withTimeoutMessage(
      () => controller.webSelectButtonCombobox(
        versandId,
        WANTED_SHIPPING_LABELS[ad.shippingType as keyof typeof WANTED_SHIPPING_LABELS],
        quickDomTimeout,
      ),
      `Failed to set shipping attribute for type '${ad.shippingType}'!`,
    );
    return;
  }

  if (ad.shippingType === "PICKUP") {
    await setPickupShipping(controller, quickDomTimeout);
    return;
  }

  if ((ad.shippingOptions ?? []).length > 0) {
    await enableShippingIfAvailable(controller, quickDomTimeout);
    await controller.webClick(By.ID, "ad-shipping-options");
    await openShippingSizeSelection(controller, quickDomTimeout);
    await setShippingOptions(controller, ad, { quickDomTimeout });
    return;
  }

  if (ad.shippingCosts !== null && ad.shippingCosts !== undefined) {
    throw new Error(
      "Individual shipping (shipping_costs) is no longer supported by Kleinanzeigen. " +
      "Remove shipping_costs and configure predefined 'shipping_options' instead.",
    );
  }
  // No carrier configured: enable shipping and keep the site's defaults.
  await enableShippingIfAvailable(controller, quickDomTimeout);
}
