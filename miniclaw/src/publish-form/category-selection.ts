/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { By, TimeoutError, type WebElement } from "../web-primitives.js";
import {
  CATEGORY_CHANGE_CONTROL_XPATH,
  CATEGORY_NEXT_BUTTON_XPATH,
  CATEGORY_PICKER_RADIO_SELECTOR,
} from "./constants.js";
import { CategoryResolutionError } from "./errors.js";
import {
  clickElement,
  elementAttribute,
  stringOrNull,
  visibleElementText,
  xpathLiteral,
} from "./element-helpers.js";
import {
  type PublishingFormController,
  type PublishingFormOptions,
  type SetCategoryOptions,
} from "./types.js";

export async function resolveCategorySuggestions(
  controller: Pick<
    PublishingFormController,
    "webClick" | "webFindAll" | "webProbe" | "webSleep"
  >,
  category: string,
  { quickDomTimeout }: PublishingFormOptions = {},
): Promise<boolean> {
  const picker = await controller.webProbe(By.ID, "ad-category-picker", {
    timeout: quickDomTimeout,
  });
  if (picker === null) {
    return false;
  }

  let radioByValue = new Map<string, WebElement>();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let radios: WebElement[] = [];
    try {
      radios = await controller.webFindAll(
        By.CSS_SELECTOR,
        CATEGORY_PICKER_RADIO_SELECTOR,
        { timeout: quickDomTimeout },
      );
    } catch (error) {
      if (!(error instanceof TimeoutError)) {
        throw error;
      }
    }

    radioByValue = new Map();
    for (const radio of radios) {
      const value = String(await elementAttribute(radio, "value") ?? "").trim();
      if (value && !radioByValue.has(value)) {
        radioByValue.set(value, radio);
      }
    }

    if (radioByValue.size > 0) {
      break;
    }
    if (attempt === 0) {
      await controller.webSleep(200, 350);
    }
  }

  if (radioByValue.size === 0) {
    throw new TimeoutError(
      "Category suggestion picker element found but no radio suggestions " +
      "rendered after waiting.",
    );
  }

  const segments = category
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reverse();
  for (const segment of segments) {
    const radio = radioByValue.get(segment);
    if (!radio) {
      continue;
    }
    const radioId = stringOrNull(await elementAttribute(radio, "id"));
    try {
      if (radioId) {
        await controller.webClick(
          By.XPATH,
          "//fieldset[@id='ad-category-picker']" +
          `//label[@for=${xpathLiteral(radioId)}]`,
          quickDomTimeout,
        );
      } else {
        await clickElement(radio, "Category suggestion radio cannot be clicked");
      }
    } catch (error) {
      if (!(error instanceof TimeoutError)) {
        throw error;
      }
      await clickElement(radio, "Category suggestion radio cannot be clicked");
    }
    return true;
  }

  const offered = [...radioByValue.keys()].sort().join(", ") || "(none)";
  throw new CategoryResolutionError(
    "Category suggestion picker shown, but no segment of configured path " +
    `'${category}' matched the offered suggestions [${offered}]. Update the ` +
    "ad's 'category' to an offered ID or a valid full path.",
  );
}

export async function setCategory(
  controller: Pick<
    PublishingFormController,
    | "webClick"
    | "webFind"
    | "webFindAll"
    | "webOpen"
    | "webProbe"
    | "webSleep"
  >,
  { adFile, category, rootUrl, quickDomTimeout }: SetCategoryOptions,
): Promise<void> {
  await controller.webClick(By.ID, "ad-description");

  const categoryPathElement = await controller.webProbe(By.ID, "ad-category-path");
  const isCategoryAutoSelected = categoryPathElement !== null &&
    (await visibleElementText(categoryPathElement)) !== "";

  if (!category) {
    if (!isCategoryAutoSelected) {
      throw new Error(
        `No category specified in [${adFile}] and automatic category detection failed`,
      );
    }
    return;
  }

  await controller.webSleep();
  await controller.webClick(By.XPATH, CATEGORY_CHANGE_CONTROL_XPATH);
  await controller.webFind(By.XPATH, CATEGORY_NEXT_BUTTON_XPATH);
  await controller.webOpen(`${rootUrl}/p-kategorie-aendern.html#?path=${category}`);
  await controller.webClick(By.XPATH, CATEGORY_NEXT_BUTTON_XPATH);
  await resolveCategorySuggestions(controller, category, { quickDomTimeout });
}
