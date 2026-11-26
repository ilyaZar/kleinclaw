/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { isRecord } from "../value-guards.js";
import {
  type WebElement,
  type WebResponse,
} from "../web-primitives.js";

export interface ShippingOption {
  id: string;
  packageSize: string;
  priceInEuroCent: number;
}

export function dimensionsFromBelenConf(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  const analytics = value.universalAnalyticsOpts;
  if (!isRecord(analytics)) {
    return {};
  }
  return isRecord(analytics.dimensions) ? analytics.dimensions : {};
}

export function textAttribute(value: unknown, name: string): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const raw = value[name];
  if (raw === null || raw === undefined) {
    return null;
  }
  return String(raw);
}

export async function visibleText(element: WebElement): Promise<string> {
  if (element.evaluate) {
    return String(await element.evaluate(`
      function (elem) {
        let sel = window.getSelection();
        sel.removeAllRanges();
        let range = document.createRange();
        range.selectNode(elem);
        sel.addRange(range);
        let visibleText = sel.toString().trim();
        sel.removeAllRanges();
        return visibleText;
      }
    `) ?? "");
  }
  if (element.textContent) {
    return (await element.textContent()) ?? "";
  }
  const text = (element as { text?: unknown }).text;
  return text === null || text === undefined ? "" : String(text);
}

export function removeSuffix(value: string, suffix: string): string {
  return suffix && value.endsWith(suffix)
    ? value.slice(0, -suffix.length)
    : value;
}

export function parseGermanDecimal(value: string): number {
  return Number.parseFloat(value.replaceAll(".", "").replace(",", "."));
}

export function parseGermanCreationDate(value: string): string {
  const parts = value.trim().split(".");
  if (parts.length !== 3) {
    throw new Error(`invalid creation date: ${value}`);
  }
  const [day, month, year] = parts;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`invalid creation date: ${value}`);
  }
  return `${year}-${month}-${day}T00:00:00`;
}

export function parsePriceAmount(value: string): number {
  const amount = value.replaceAll(".", "").split(/\s+/, 1)[0] ?? "";
  return Number.parseInt(amount, 10);
}

export function shippingOptionsFromResponse(
  response: WebResponse,
): ShippingOption[] {
  const decoded = JSON.parse(response.content) as unknown;
  if (!isRecord(decoded)) {
    return [];
  }
  const data = decoded.data;
  if (!isRecord(data)) {
    return [];
  }
  const shippingOptionsResponse = data.shippingOptionsResponse;
  if (
    !isRecord(shippingOptionsResponse) ||
    !Array.isArray(shippingOptionsResponse.options)
  ) {
    return [];
  }

  return shippingOptionsResponse.options.flatMap((option): ShippingOption[] => {
    if (!isRecord(option)) {
      return [];
    }
    const id = option.id;
    const packageSize = option.packageSize;
    const priceInEuroCent = option.priceInEuroCent;
    if (
      typeof id !== "string" ||
      typeof packageSize !== "string" ||
      typeof priceInEuroCent !== "number"
    ) {
      return [];
    }
    return [{ id, packageSize, priceInEuroCent }];
  });
}

export function translateDamageAttribute(value: string): string {
  return [...value].map((char) => {
    if (char === "t") {
      return "ja";
    }
    if (char === "f") {
      return "nein";
    }
    return char;
  }).join("");
}

const AD_DIMENSIONS_RE = /\{[^{}]*"ad_attributes"[^{}]*\}/;
// A dimension value containing a brace truncates the object match; the
// attributes alone are still usable then.
const AD_ATTRIBUTES_RE = /"ad_attributes"\s*:\s*"([^"]*)"/;
const AD_PAGE_URL_PREFIX = "https://www.kleinanzeigen.de/s-anzeige/";
const MAX_REDIRECTS = 3;

// The canonical ad dimensions embedded in an ad page's HTML (the object in
// window.BelenConf that carries `ad_attributes`), or null.
export function parseAdDimensionsHtml(html: string): Record<string, unknown> | null {
  const match = AD_DIMENSIONS_RE.exec(html);
  if (match) {
    try {
      const dimensions: unknown = JSON.parse(match[0]);
      if (isRecord(dimensions)) {
        return dimensions;
      }
    } catch {
      // fall through to the attributes-only match
    }
  }
  const attributes = AD_ATTRIBUTES_RE.exec(html);
  return attributes ? { ad_attributes: attributes[1]!.replace(/&amp;/g, "&") } : null;
}

function isTrustedAdPageUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" &&
    (host === "kleinanzeigen.de" || host.endsWith(".kleinanzeigen.de"));
}

// Redesigned ad pages have no BelenConf, but the same ad served to an
// anonymous visitor still embeds the dimensions. One request, no cookies,
// redirects only within Kleinanzeigen hosts.
export async function fetchAnonymousAdDimensions(
  adId: number,
  {
    fetchImpl = fetch,
    timeoutMs = 15_000,
  }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Record<string, unknown> | null> {
  let url = new URL(`${AD_PAGE_URL_PREFIX}${adId}`);
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetchImpl(url, {
        headers: { "Accept-Language": "de-DE,de;q=0.9" },
        redirect: "manual",
        signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        const next = location ? new URL(location, url) : null;
        if (!next || !isTrustedAdPageUrl(next)) {
          return null;
        }
        url = next;
        continue;
      }
      return response.ok ? parseAdDimensionsHtml(await response.text()) : null;
    }
  } catch {
    return null;
  }
  return null;
}
