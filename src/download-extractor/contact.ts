/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { extractAdIdFromAdUrl } from "../ad-identity.js";
import { type ContactInput } from "../model/ad-model.js";
import { isRecord } from "../value-guards.js";
import {
  By,
  TimeoutError,
  type WebElement,
  type WebLocator,
} from "../web-primitives.js";

interface ContactController {
  webFind(
    type: By,
    value: string,
    options?: { parent?: WebLocator | WebElement | null; timeout?: number },
  ): Promise<WebLocator>;
  webText(
    type: By,
    value: string,
    options?: { parent?: WebLocator | WebElement | null; timeout?: number },
  ): Promise<string>;
}

export function extractSellDirectlyFromAdPage(
  pageUrl: string,
  publishedAdsById: ReadonlyMap<number, unknown>,
): boolean | null {
  try {
    const currentAdId = extractAdIdFromAdUrl(pageUrl);
    if (currentAdId === -1) {
      return null;
    }
    const cachedAd = publishedAdsById.get(currentAdId);
    if (!isRecord(cachedAd)) {
      return null;
    }
    const buyNowEligible = cachedAd?.buyNowEligible;
    return typeof buyNowEligible === "boolean" ? buyNowEligible : null;
  } catch {
    return null;
  }
}

export async function extractContactFromAdPage(
  controller: ContactController,
): Promise<ContactInput> {
  const contact: ContactInput = {};
  const addressText = await controller.webText(By.ID, "viewad-locality");
  try {
    const street = await controller.webText(By.ID, "street-address");
    contact.street = street.slice(0, -1);
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }

  const [zipcode, ...locationParts] = addressText.split(" ");
  contact.zipcode = zipcode ?? "";
  contact.location = locationParts.join(" ");

  const contactPersonElement = await controller.webFind(By.ID, "viewad-contact");
  const nameElement = await controller.webFind(
    By.CLASS_NAME,
    "iconlist-text",
    { parent: contactPersonElement },
  );
  try {
    contact.name = await controller.webText(
      By.TAG_NAME,
      "a",
      { parent: nameElement },
    );
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
    contact.name = await controller.webText(
      By.TAG_NAME,
      "span",
      { parent: nameElement },
    );
  }

  if (!("street" in contact)) {
    contact.street = null;
  }
  try {
    const phoneElement = await controller.webFind(
      By.ID,
      "viewad-contact-phone",
    );
    const phoneNumber = await controller.webText(
      By.TAG_NAME,
      "a",
      { parent: phoneElement },
    );
    contact.phone = phoneNumber
      .replaceAll("-", " ")
      .split(" ")
      .join("")
      .replace("+49(0)", "0");
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
    contact.phone = null;
  }

  return contact;
}
