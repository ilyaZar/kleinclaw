/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { OPTION_NAME_BY_CARRIER_CODE, type AdInput } from "../model/ad-model.js";
import { type Config } from "../model/config-model.js";
import {
  By,
  TimeoutError,
  type WebResponse,
} from "../web-primitives.js";
import {
  parseGermanDecimal,
  parsePriceAmount,
  shippingOptionsFromResponse,
} from "./page-data.js";

const SHIPPING_OPTIONS_URL =
  "https://gateway.kleinanzeigen.de/postad/api/v1/" +
  "shipping-options?posterType=PRIVATE";

interface PricingShippingController {
  webText(type: By, value: string): Promise<string>;
  webRequest(
    url: string,
    method?: string,
    validResponseCodes?: number | Iterable<number>,
    headers?: Record<string, string> | null,
  ): Promise<WebResponse>;
}

export async function extractPricingInfoFromAdPage(
  controller: PricingShippingController,
): Promise<[
  AdInput["price"],
  NonNullable<AdInput["price_type"]>,
]> {
  try {
    const priceText = await controller.webText(By.ID, "viewad-price");
    const lastToken = priceText.trim().split(/\s+/).at(-1);
    if (lastToken === "€") {
      return [parsePriceAmount(priceText), "FIXED"];
    }
    if (lastToken === "VB") {
      const price = priceText.trim() === "VB" ? null : parsePriceAmount(priceText);
      return [price, "NEGOTIABLE"];
    }
    if (lastToken === "verschenken") {
      return [null, "GIVE_AWAY"];
    }
    return [null, "NOT_APPLICABLE"];
  } catch (error) {
    if (error instanceof TimeoutError) {
      return [null, "NOT_APPLICABLE"];
    }
    throw error;
  }
}

export async function extractShippingInfoFromAdPage(
  config: Config,
  controller: PricingShippingController,
): Promise<[
  NonNullable<AdInput["shipping_type"]>,
  number | null,
  string[] | null,
]> {
  try {
    const shippingText = await controller.webText(
      By.CLASS_NAME,
      "boxedarticle--details--shipping",
    );
    if (shippingText === "Nur Abholung") {
      return ["PICKUP", null, null];
    }
    if (shippingText === "Versand möglich") {
      return ["SHIPPING", null, null];
    }
    if (!shippingText.includes("€")) {
      return ["NOT_APPLICABLE", null, null];
    }

    const priceParts = shippingText.split(" ");
    const shippingCosts = parseGermanDecimal(priceParts.at(-2) ?? "");
    const priceInCent = Math.round(shippingCosts * 100);
    const response = await controller.webRequest(SHIPPING_OPTIONS_URL);
    const options = shippingOptionsFromResponse(response);

    if (config.download.includeAllMatchingShippingOptions) {
      const matchingOptions = options.filter(
        (option) => option.priceInEuroCent === priceInCent,
      );
      if (!matchingOptions.length) {
        return ["SHIPPING", shippingCosts, null];
      }
      const matchingSize = matchingOptions[0]!.packageSize;
      const shippingOptions = options
        .filter((option) => option.packageSize === matchingSize)
        .map((option) => OPTION_NAME_BY_CARRIER_CODE[option.id])
        .filter((option): option is string => {
          if (!option) {
            return false;
          }
          return !config.download.excludedShippingOptions.includes(option);
        });
      return ["SHIPPING", shippingCosts, shippingOptions];
    }

    const matchingOption = options.find(
      (option) => option.priceInEuroCent === priceInCent,
    );
    if (!matchingOption) {
      return ["SHIPPING", shippingCosts, null];
    }
    const shippingOption = OPTION_NAME_BY_CARRIER_CODE[matchingOption.id];
    if (
      !shippingOption ||
      config.download.excludedShippingOptions.includes(shippingOption)
    ) {
      return ["SHIPPING", shippingCosts, null];
    }
    return ["SHIPPING", shippingCosts, [shippingOption]];
  } catch (error) {
    if (error instanceof TimeoutError) {
      return ["NOT_APPLICABLE", null, null];
    }
    throw error;
  }
}
