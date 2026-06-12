/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  By,
  Is,
  TimeoutError,
  type WebElement,
  type WebLocator,
} from "../web-primitives.js";
import {
  CITY_LISTBOX_ID_FALLBACK,
  CITY_SELECTED_OPTION_ID,
} from "./constants.js";
import { setFrameworkInputValue } from "./core-fields.js";
import {
  clickElement,
  elementAttribute,
  elementInputValue,
  elementLocalName,
  inspectSpecialAttributeElement,
  visibleElementText,
} from "./element-helpers.js";
import {
  type PublishingContact,
  type PublishingFormController,
  type PublishingFormOptions,
} from "./types.js";

function normalizeLocationText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function locationMatchesTarget(
  target: string,
  candidate: string | null | undefined,
): boolean {
  const normalizedTarget = normalizeLocationText(target);
  const normalizedCandidate = normalizeLocationText(candidate ?? "");
  if (!normalizedTarget || !normalizedCandidate) {
    return false;
  }
  if (normalizedTarget === normalizedCandidate) {
    return true;
  }
  if (normalizedTarget.includes(" - ")) {
    return false;
  }
  return normalizedCandidate.startsWith(`${normalizedTarget} - `) ||
    normalizedCandidate.split(" - ").at(-1) === normalizedTarget;
}

function cssStringValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function cityListboxOptionSelector(listboxId: string): string {
  const listboxSelector = `[id="${cssStringValue(listboxId)}"]`;
  return [
    `${listboxSelector} [role='option']`,
    `${listboxSelector} li[aria-selected='true']`,
    `${listboxSelector} li[aria-selected='false']`,
    `${listboxSelector} button[aria-selected='true']`,
    `${listboxSelector} button[aria-selected='false']`,
  ].join(", ");
}

async function cityOptionText(element: WebElement): Promise<string> {
  return (await visibleElementText(element)).replace(/\s+/g, " ").trim();
}

export async function readCitySelectionText(
  controller: Pick<PublishingFormController, "webFind">,
  { quickDomTimeout }: PublishingFormOptions = {},
): Promise<string | null> {
  let cityElement: WebLocator;
  try {
    cityElement = await controller.webFind(
      By.ID,
      "ad-city",
      { timeout: quickDomTimeout },
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      return null;
    }
    throw error;
  }

  if (await elementLocalName(cityElement) === "input") {
    const value = await elementInputValue(cityElement);
    if (value) {
      return value;
    }
  }

  try {
    const selectedOption = await controller.webFind(
      By.ID,
      CITY_SELECTED_OPTION_ID,
      { timeout: quickDomTimeout },
    );
    const selectedText = await visibleElementText(selectedOption);
    if (selectedText) {
      return selectedText;
    }
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }

  const cityText = await visibleElementText(cityElement);
  return cityText || null;
}

export async function selectCityComboboxOption(
  controller: Pick<
    PublishingFormController,
    "webClick" | "webFind" | "webFindAll"
  >,
  target: string,
  { quickDomTimeout }: PublishingFormOptions = {},
): Promise<void> {
  await controller.webClick(By.ID, "ad-city", quickDomTimeout);
  const cityElement = await controller.webFind(
    By.ID,
    "ad-city",
    { timeout: quickDomTimeout },
  );
  const controls = String(await elementAttribute(cityElement, "aria-controls") ?? "");
  const listboxId = controls.trim().split(/\s+/).filter(Boolean).at(0) ??
    CITY_LISTBOX_ID_FALLBACK;
  const options = await controller.webFindAll(
    By.CSS_SELECTOR,
    cityListboxOptionSelector(listboxId),
    { timeout: quickDomTimeout },
  );

  const normalizedTarget = normalizeLocationText(target);
  const exactMatches: WebElement[] = [];
  const citySuffixMatches: WebElement[] = [];
  const prefixMatches: WebElement[] = [];

  for (const option of options) {
    const text = await cityOptionText(option);
    const normalizedOption = normalizeLocationText(text);
    if (!normalizedOption) {
      continue;
    }
    if (normalizedOption === normalizedTarget) {
      exactMatches.push(option);
      continue;
    }
    if (!normalizedTarget.includes(" - ")) {
      if (normalizedOption.split(" - ").at(-1) === normalizedTarget) {
        citySuffixMatches.push(option);
      } else if (normalizedOption.startsWith(`${normalizedTarget} - `)) {
        prefixMatches.push(option);
      }
    }
  }

  let selected: WebElement | null = exactMatches[0] ?? null;
  if (selected === null && citySuffixMatches.length > 1) {
    throw new TimeoutError(
      `Ambiguous contact location '${target}' matched multiple city options`,
    );
  }
  selected ??= citySuffixMatches[0] ?? null;
  if (selected === null && prefixMatches.length > 1) {
    throw new TimeoutError(
      `Ambiguous contact location '${target}' matched multiple city options`,
    );
  }
  selected ??= prefixMatches[0] ?? null;
  if (selected === null) {
    throw new TimeoutError(`No city option matched contact location '${target}'`);
  }

  await clickElement(selected, `Unable to click city option for '${target}'`);

  const selectedText = await readCitySelectionText(controller, { quickDomTimeout });
  if (!locationMatchesTarget(target, selectedText)) {
    throw new TimeoutError(`City selection did not converge to '${target}'`);
  }
}

export async function setContactLocation(
  controller: Pick<
    PublishingFormController,
    "webClick" | "webFind" | "webFindAll"
  >,
  location: string | null | undefined,
  { quickDomTimeout }: PublishingFormOptions = {},
): Promise<void> {
  const target = String(location ?? "").trim();
  if (!target) {
    return;
  }

  const selectedText = await readCitySelectionText(controller, { quickDomTimeout });
  if (locationMatchesTarget(target, selectedText)) {
    return;
  }

  const cityElement = await controller.webFind(
    By.ID,
    "ad-city",
    { timeout: quickDomTimeout },
  );
  const info = await inspectSpecialAttributeElement(cityElement);
  if (info.localName !== "button" || info.role !== "combobox") {
    throw new TimeoutError(
      `Unsupported city element type while setting contact location: ${info.localName}`,
    );
  }

  await selectCityComboboxOption(controller, target, { quickDomTimeout });
}

export async function setContactFields(
  controller: Pick<
    PublishingFormController,
    | "webCheck"
    | "webClick"
    | "webExecute"
    | "webFind"
    | "webFindAll"
    | "webInput"
    | "webProbe"
    | "webSleep"
  >,
  contact: PublishingContact,
  { quickDomTimeout }: PublishingFormOptions = {},
): Promise<void> {
  if (contact.zipcode) {
    const zipcode = String(contact.zipcode);
    try {
      await controller.webInput(By.ID, "ad-zip-code", zipcode);
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new TimeoutError(`Failed to set contact zipcode: ${zipcode}`);
      }
      throw error;
    }
    await setContactLocation(controller, contact.location, { quickDomTimeout });
  }

  if (contact.street) {
    try {
      if (await controller.webCheck(By.ID, "ad-street", Is.DISABLED)) {
        await controller.webClick(By.ID, "ad-address-visibility");
        await controller.webSleep();
      }
      await setFrameworkInputValue(controller, "ad-street", contact.street);
    } catch (error) {
      if (!(error instanceof TimeoutError)) {
        throw error;
      }
    }
  }

  if (contact.name) {
    try {
      if (!await controller.webCheck(By.ID, "ad-name", Is.READONLY)) {
        await setFrameworkInputValue(controller, "ad-name", contact.name);
      }
    } catch (error) {
      if (!(error instanceof TimeoutError)) {
        throw error;
      }
    }
  }

  if (contact.phone) {
    try {
      const phoneElement = await controller.webProbe(
        By.ID,
        "ad-phone",
        { timeout: quickDomTimeout },
      );
      if (phoneElement === null) {
        return;
      }
      if (await controller.webCheck(By.ID, "ad-phone", Is.DISABLED, quickDomTimeout)) {
        await controller.webClick(By.ID, "ad-phone-visibility", quickDomTimeout);
        await controller.webSleep();
      }
      await setFrameworkInputValue(controller, "ad-phone", contact.phone);
    } catch (error) {
      if (!(error instanceof TimeoutError)) {
        throw error;
      }
    }
  }
}
