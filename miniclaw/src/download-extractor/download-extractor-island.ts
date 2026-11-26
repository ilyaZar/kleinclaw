/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

// Redesigned (Astro) ad pages embed all ad data in an <astro-island> `props`
// attribute, even when the page has not hydrated the visible markup. Values
// are wrapped as [typeIndex, value].

import { CONDITION_TO_API } from "../condition.js";
import { isRecord } from "../value-guards.js";
import { AD_ISLAND_PROPS_SCRIPT, callPageScript } from "../web/page-scripts.js";

export type IslandProps = Record<string, unknown>;

const PRICE_TYPES = new Set(["FIXED", "NEGOTIABLE", "GIVE_AWAY"]);
const LABEL_TO_KEY: Record<string, string> = { art: "art_s", zustand: "condition_s" };

export function unwrapIsland(value: unknown): unknown {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "number"
    ? value[1]
    : value;
}

function islandRecord(value: unknown): IslandProps | null {
  const unwrapped = unwrapIsland(value);
  return isRecord(unwrapped) ? unwrapped : null;
}

function islandString(value: unknown): string | null {
  const unwrapped = unwrapIsland(value);
  return typeof unwrapped === "string" && unwrapped.trim() ? unwrapped.trim() : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// The island data, unwrapped from its `data: [0, {...}]` envelope; {} when
// the page has none.
export function parseIslandProps(raw: unknown): IslandProps {
  if (typeof raw !== "string" || !raw) {
    return {};
  }
  for (const candidate of [raw, decodeEntities(raw)]) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (isRecord(parsed)) {
      return islandRecord(parsed.data) ?? parsed;
    }
  }
  return {};
}

export async function readIslandProps(
  controller: { webExecute(js: string): Promise<unknown> },
): Promise<IslandProps> {
  try {
    return parseIslandProps(await controller.webExecute(callPageScript(AD_ISLAND_PROPS_SCRIPT)));
  } catch {
    return {};
  }
}

export function islandImageUrls(props: IslandProps): string[] {
  const list = unwrapIsland(islandRecord(props.imageDetails)?.imageList);
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((entry) => {
    const image = islandRecord(entry);
    const url = image &&
      islandString(image.xxLargeUrl ?? image.xLargeUrl ?? image.largeUrl);
    return url ? [url] : [];
  });
}

export function islandPricing(props: IslandProps): [number | null, string] | null {
  const price = islandRecord(props.price);
  if (!price) {
    return null;
  }
  const rawType = unwrapIsland(price.type);
  let priceType = typeof rawType === "string" && PRICE_TYPES.has(rawType)
    ? rawType
    : "NOT_APPLICABLE";
  const amount = unwrapIsland(price.amount);
  let value = typeof amount === "number" && Number.isFinite(amount) ? Math.trunc(amount) : null;
  if (priceType === "GIVE_AWAY") {
    value = null;
  } else if (priceType === "FIXED" && value === null) {
    priceType = "NOT_APPLICABLE";
  }
  return [value, priceType];
}

// "Nur Abholung", "Versand möglich" or "+ Versand ab 4,89 €"
export function islandShippingText(props: IslandProps): string | null {
  return islandString(props.shippingHeader);
}

// The full name; the redesigned page itself only shows initials.
export function islandContactName(props: IslandProps): string | null {
  return islandString(islandRecord(props.userDetails)?.contactName);
}

export function islandCreationDate(props: IslandProps): string | null {
  const date = islandString(props.formattedCreationDate);
  return date && /^\d{2}\.\d{2}\.\d{4}$/.test(date) ? date : null;
}

// Only display labels are available here (e.g. "Art" -> "Zubehör").
export function islandSpecialAttributes(props: IslandProps): Record<string, string> {
  const attributes: Record<string, string> = {};
  const entries = unwrapIsland(props.localizedAttributes);
  if (!Array.isArray(entries)) {
    return attributes;
  }
  for (const raw of entries) {
    const entry = islandRecord(raw);
    const label = entry && islandString(entry.localizedName);
    const value = entry && islandString(entry.localizedValue);
    const key = label ? LABEL_TO_KEY[label.toLowerCase()] : undefined;
    if (!key || !value) {
      continue;
    }
    if (key === "condition_s") {
      const apiValue = CONDITION_TO_API[value.toLowerCase()];
      if (apiValue) {
        attributes[key] = apiValue;
      }
    } else {
      attributes[key] = value;
    }
  }
  return attributes;
}
