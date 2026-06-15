/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { AdUpdateStrategy, CARRIER_CODE_BY_OPTION, CARRIER_CODES_BY_SIZE, SIZE_INFO_BY_CARRIER_CODE, } from "../model/ad-model.js";
import { By, Is, TimeoutError } from "../web-primitives.js";
import { SHIPPING_BACK_BUTTON_XPATH, SHIPPING_DIALOG_DONE_BUTTON_XPATH, SHIPPING_DIALOG_NEXT_BUTTON_XPATH, SHIPPING_DIALOG_XPATH, SHIPPING_DONE_BUTTON_XPATH, SHIPPING_OTHER_METHODS_BUTTON_XPATH, } from "./constants.js";
import { setFrameworkInputValue } from "./core-fields.js";
import { elementHasAttribute, xpathLiteral } from "./element-helpers.js";
export function shippingCostInputValue(value) {
    return String(value).replace(".", ",");
}
function shippingSizeRadioXPath(radioValue) {
    return (`${SHIPPING_DIALOG_XPATH}//input` +
        `[@type="radio" and @value=${xpathLiteral(radioValue)}]`);
}
function shippingCarrierCheckboxXPath(carrierCode) {
    return (`${SHIPPING_DIALOG_XPATH}//input` +
        `[@type="checkbox" and @value=${xpathLiteral(carrierCode)}]`);
}
async function withTimeoutMessage(action, message) {
    try {
        return await action();
    }
    catch (error) {
        if (error instanceof TimeoutError) {
            throw new TimeoutError(message);
        }
        throw error;
    }
}
async function enableShippingIfAvailable(controller, quickDomTimeout) {
    try {
        await controller.webClick(By.ID, "ad-shipping-enabled-yes", quickDomTimeout);
        await controller.webSleep(500, 800);
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
}
async function setPickupShipping(controller, quickDomTimeout) {
    const pickupRadio = await controller.webProbe(By.ID, "ad-shipping-enabled-no", {
        timeout: quickDomTimeout,
    });
    if (pickupRadio === null) {
        return;
    }
    await withTimeoutMessage(async () => {
        if (!await controller.webCheck(By.ID, "ad-shipping-enabled-no", Is.SELECTED, quickDomTimeout)) {
            await controller.webClick(By.ID, "ad-shipping-enabled-no", quickDomTimeout);
        }
    }, "Failed to set shipping attribute for type 'PICKUP'!");
}
async function setIndividualShippingPrice(controller, shippingCosts) {
    const priceText = shippingCostInputValue(shippingCosts);
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            await setFrameworkInputValue(controller, "ad-individual-shipping-price", priceText);
            const actual = await controller.webExecute("document.getElementById('ad-individual-shipping-price')?.value");
            if (actual === priceText) {
                return;
            }
        }
        catch (error) {
            if (!(error instanceof TimeoutError)) {
                throw error;
            }
            if (attempt >= maxAttempts) {
                throw new TimeoutError("Unable to set shipping price!");
            }
            await controller.webSleep(300, 500);
            continue;
        }
        if (attempt >= maxAttempts) {
            throw new TimeoutError("Unable to set shipping price!");
        }
        await controller.webSleep(300, 500);
    }
}
async function setIndividualShipping(controller, ad, quickDomTimeout) {
    try {
        await controller.webClick(By.XPATH, SHIPPING_OTHER_METHODS_BUTTON_XPATH, quickDomTimeout);
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
    const individualPrice = await controller.webProbe(By.ID, "ad-individual-shipping-price", { timeout: quickDomTimeout });
    if (individualPrice === null) {
        await withTimeoutMessage(() => controller.webClick(By.ID, "ad-individual-shipping-checkbox-control"), "Unable to select individual shipping option!");
    }
    if (ad.shippingCosts !== null && ad.shippingCosts !== undefined) {
        await setIndividualShippingPrice(controller, ad.shippingCosts);
    }
    await withTimeoutMessage(() => controller.webClick(By.XPATH, SHIPPING_DONE_BUTTON_XPATH), "Unable to close shipping dialog!");
}
export function shippingOptionCarrierCodes(options) {
    try {
        return [...new Set(options)].map((option) => {
            const carrierCode = CARRIER_CODE_BY_OPTION[option];
            if (!carrierCode) {
                throw new Error(option);
            }
            return carrierCode;
        });
    }
    catch (error) {
        if (error instanceof Error) {
            throw new Error("Unknown shipping option(s), please refer to the documentation/README: " +
                options.join(","));
        }
        throw error;
    }
}
function shippingSizeInfoForCarrierCodes(carrierCodes) {
    const sizeKeys = new Set(carrierCodes.map((carrierCode) => {
        const [size, radioValue] = SIZE_INFO_BY_CARRIER_CODE[carrierCode] ?? [];
        return `${size}\u0000${radioValue}`;
    }));
    if (sizeKeys.size !== 1) {
        throw new Error("You can only specify shipping options for one package size!");
    }
    const sizeKey = [...sizeKeys][0];
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
export async function setShippingOptions(controller, ad, { quickDomTimeout } = {}) {
    if (!ad.shippingOptions || ad.shippingOptions.length === 0) {
        throw new Error("shipping_options must be provided");
    }
    const wantedCarrierCodes = shippingOptionCarrierCodes(ad.shippingOptions);
    const { carrierCodesForSize, radioValue } = shippingSizeInfoForCarrierCodes(wantedCarrierCodes);
    const wantedCodes = new Set(wantedCarrierCodes);
    const sizeRadioXPath = shippingSizeRadioXPath(radioValue);
    await withTimeoutMessage(async () => {
        const sizeRadio = await controller.webFind(By.XPATH, sizeRadioXPath, { timeout: quickDomTimeout });
        if (!await elementHasAttribute(sizeRadio, "checked")) {
            await controller.webClick(By.XPATH, sizeRadioXPath, quickDomTimeout);
        }
        await controller.webSleep(300, 500);
        await controller.webClick(By.XPATH, SHIPPING_DIALOG_NEXT_BUTTON_XPATH, quickDomTimeout);
        await controller.webSleep(500, 800);
        for (const carrierCode of carrierCodesForSize) {
            const checkboxXPath = shippingCarrierCheckboxXPath(carrierCode);
            const checkbox = await controller.webFind(By.XPATH, checkboxXPath, { timeout: quickDomTimeout });
            const isChecked = await elementHasAttribute(checkbox, "checked");
            const shouldBeChecked = wantedCodes.has(carrierCode);
            if (isChecked !== shouldBeChecked) {
                await controller.webClick(By.XPATH, checkboxXPath, quickDomTimeout);
            }
        }
    }, "Failed to configure shipping options in dialog!");
    await withTimeoutMessage(() => controller.webClick(By.XPATH, SHIPPING_DIALOG_DONE_BUTTON_XPATH, quickDomTimeout), "Unable to close shipping dialog!");
}
export async function setShipping(controller, ad, { mode = AdUpdateStrategy.Replace, quickDomTimeout, } = {}) {
    if (ad.shippingType === "NOT_APPLICABLE") {
        return;
    }
    if (ad.shippingType === "PICKUP") {
        await setPickupShipping(controller, quickDomTimeout);
        return;
    }
    const shippingOptions = ad.shippingOptions ?? [];
    if (shippingOptions.length > 0) {
        await enableShippingIfAvailable(controller, quickDomTimeout);
        await controller.webClick(By.ID, "ad-shipping-options");
        if (mode === AdUpdateStrategy.Modify) {
            try {
                await controller.webFind(By.XPATH, SHIPPING_OTHER_METHODS_BUTTON_XPATH, { timeout: quickDomTimeout });
            }
            catch (error) {
                if (!(error instanceof TimeoutError)) {
                    throw error;
                }
                await controller.webClick(By.XPATH, SHIPPING_BACK_BUTTON_XPATH);
                try {
                    await controller.webFind(By.XPATH, SHIPPING_OTHER_METHODS_BUTTON_XPATH, { timeout: quickDomTimeout });
                }
                catch (secondError) {
                    if (!(secondError instanceof TimeoutError)) {
                        throw secondError;
                    }
                    await controller.webClick(By.XPATH, SHIPPING_BACK_BUTTON_XPATH);
                }
            }
        }
        await controller.webClick(By.XPATH, SHIPPING_OTHER_METHODS_BUTTON_XPATH);
        await setShippingOptions(controller, ad, { quickDomTimeout });
        return;
    }
    await enableShippingIfAvailable(controller, quickDomTimeout);
    await withTimeoutMessage(() => controller.webClick(By.ID, "ad-shipping-options"), "Unable to open shipping options dialog!");
    await setIndividualShipping(controller, ad, quickDomTimeout);
}
