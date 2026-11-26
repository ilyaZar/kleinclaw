/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  islandSpecialAttributes,
  type IslandProps,
} from "./download-extractor-island.js";
import { elementAttribute } from "./download-extractor-browser-elements.js";
import {
  removeSuffix,
  textAttribute,
  visibleText,
} from "./download-extractor-page-data.js";
import { type WebReadController } from "./download-extractor-controller.js";
import {
  By,
  TimeoutError,
  type WebElement,
} from "../web-primitives.js";
import { CONDITION_TO_API } from "../condition.js";

const BREADCRUMB_MIN_DEPTH = 2;
const BREADCRUMB_RE = /\/c(\d+)/g;
const LABEL_TO_KEY: Record<string, string> = {
  zustand: "condition_s",
};

type ClassificationController = Pick<
  WebReadController,
  "webFind" | "webFindAll" | "webText"
>;

export async function extractCategoryFromAdPage(
  controller: ClassificationController,
): Promise<string> {
  const categoryLine = await controller.webFind(By.ID, "vap-brdcrmb");
  let breadcrumbLinks: WebElement[] = [];
  try {
    breadcrumbLinks = await controller.webFindAll(
      By.CSS_SELECTOR,
      "a",
      { parent: categoryLine },
    );
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }

  const categoryIds: string[] = [];
  for (const link of breadcrumbLinks) {
    const href = await elementAttribute(link, "href") ?? "";
    const ids = [...href.matchAll(BREADCRUMB_RE)].map((match) => match[1]!);
    categoryIds.push(...ids);
  }

  if (categoryIds.length >= BREADCRUMB_MIN_DEPTH) {
    return `${categoryIds.at(-2)!}/${categoryIds.at(-1)!}`;
  }
  if (categoryIds.length === 1) {
    return `${categoryIds[0]}/${categoryIds[0]}`;
  }

  try {
    const categoryFirstPart = await controller.webFind(
      By.CSS_SELECTOR,
      "a:nth-of-type(2)",
      { parent: categoryLine },
    );
    const categorySecondPart = await controller.webFind(
      By.CSS_SELECTOR,
      "a:nth-of-type(3)",
      { parent: categoryLine },
    );
    const hrefFirst = await elementAttribute(categoryFirstPart, "href") ?? "";
    const hrefSecond = await elementAttribute(categorySecondPart, "href") ?? "";
    const firstRaw = hrefFirst.split("/").at(-1) ?? "";
    const secondRaw = hrefSecond.split("/").at(-1) ?? "";
    const first = firstRaw.startsWith("c") ? firstRaw.slice(1) : firstRaw;
    const second = secondRaw.startsWith("c") ? secondRaw.slice(1) : secondRaw;
    return `${first}/${second}`;
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new TimeoutError(
        "Unable to locate breadcrumb fallback selectors within the " +
          "configured timeout.",
      );
    }
    throw error;
  }
}

// `versand_s` is modelled as shipping, `seller_badges_s` is tracking data
// without a form field.
const IGNORED_ATTRIBUTES = new Set(["versand_s", "seller_badges_s"]);

export function parseAdAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const item of raw.split("|")) {
    const separator = item.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = item.slice(0, separator);
    if (!IGNORED_ATTRIBUTES.has(key.split(".").at(-1) ?? key)) {
      attributes[key] = item.slice(separator + 1);
    }
  }
  return attributes;
}

// From the canonical dimensions (BelenConf or the anonymous ad page);
// without them from the details section, then from the island data.
export async function extractSpecialAttributesFromAdPage(
  controller: ClassificationController,
  dimensions: Record<string, unknown>,
  islandProps: IslandProps = {},
): Promise<Record<string, string>> {
  const specialAttributesRaw = textAttribute(dimensions, "ad_attributes");
  if (specialAttributesRaw) {
    return parseAdAttributes(specialAttributesRaw);
  }
  const fromDom = await extractSpecialAttributesFromDom(controller);
  return Object.keys(fromDom).length > 0 ? fromDom : islandSpecialAttributes(islandProps);
}

export async function extractSpecialAttributesFromDom(
  controller: ClassificationController,
): Promise<Record<string, string>> {
  const attributes: Record<string, string> = {};
  let detailItems: WebElement[];
  try {
    detailItems = await controller.webFindAll(
      By.CSS_SELECTOR,
      "#viewad-details .addetailslist--detail",
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      return attributes;
    }
    throw error;
  }

  for (const item of detailItems) {
    let valueText: string;
    let fullText: string;
    try {
      valueText = (await controller.webText(
        By.CSS_SELECTOR,
        ".addetailslist--detail--value",
        { parent: item },
      )).trim().toLowerCase();
      fullText = (await visibleText(item)).trim().toLowerCase();
    } catch (error) {
      if (error instanceof TimeoutError) {
        continue;
      }
      throw error;
    }

    const label = removeSuffix(fullText, valueText).trim();
    const attrKey = LABEL_TO_KEY[label];
    if (!attrKey) {
      continue;
    }
    if (attrKey === "condition_s") {
      const apiValue = CONDITION_TO_API[valueText];
      if (apiValue) {
        attributes[attrKey] = apiValue;
      }
      continue;
    }
    attributes[attrKey] = valueText;
  }

  return attributes;
}
