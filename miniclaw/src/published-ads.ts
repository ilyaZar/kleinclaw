/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { isRecord } from "./value-guards.js";

// 25 ads per page, same safety limit as the HTML overview
const MAX_PAGE_LIMIT = 200;
const SNIPPET_LIMIT = 500;

export type PublishedAd = Record<string, unknown> & {
  id: unknown;
  state: unknown;
};

export type PublishedAdsWebRequest = (url: string) => Promise<unknown>;

export interface FetchPublishedAdsOptions {
  rootUrl?: string;
  strict?: boolean;
  maxPageLimit?: number;
}

export class PublishedAdsFetchIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishedAdsFetchIncompleteError";
  }
}

function typeName(value: unknown): string {
  if (value === null) {
    return "NoneType";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (Buffer.isBuffer(value)) {
    return "bytes";
  }
  if (value instanceof Uint8Array) {
    return "bytearray";
  }
  if (Array.isArray(value)) {
    return "list";
  }
  if (typeof value === "object") {
    return "dict";
  }
  return typeof value;
}

function truncate(text: string): string {
  return text.length > SNIPPET_LIMIT
    ? `${text.slice(0, SNIPPET_LIMIT)}...`
    : text;
}

function preview(value: unknown): string {
  return truncate(typeof value === "string" ? value : String(value));
}

function contentToString(content: unknown): string | null {
  if (content instanceof Uint8Array) {
    return Buffer.from(content).toString("utf8");
  }
  if (typeof content === "string") {
    return content;
  }
  return null;
}

function incomplete(strict: boolean, message: string): void {
  if (strict) {
    throw new PublishedAdsFetchIncompleteError(message);
  }
}

function jsonParseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function coercePageNumber(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function publishedAdsPageUrl(rootUrl: string, page: number): string {
  return `${rootUrl}/m-meine-anzeigen-verwalten.json?sort=DEFAULT&pageNum=${page}`;
}

export async function fetchPublishedAds(
  webRequest: PublishedAdsWebRequest,
  {
    rootUrl = "https://www.kleinanzeigen.de",
    strict = false,
    maxPageLimit = MAX_PAGE_LIMIT,
  }: FetchPublishedAdsOptions = {},
): Promise<PublishedAd[]> {
  const ads: PublishedAd[] = [];
  let page = 1;

  while (true) {
    if (page > maxPageLimit) {
      incomplete(
        strict,
        `Stopping pagination after ${maxPageLimit} pages to avoid infinite loop`,
      );
      break;
    }

    let response: unknown;
    try {
      response = await webRequest(publishedAdsPageUrl(rootUrl, page));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      incomplete(strict, `Pagination request failed on page ${page}: ${message}`);
      break;
    }

    if (!isRecord(response)) {
      incomplete(
        strict,
        `Unexpected pagination response type on page ${page}: ${typeName(response)}`,
      );
      break;
    }

    const rawContent = response.content ?? "";
    const content = contentToString(rawContent);
    if (content === null) {
      incomplete(
        strict,
        `Unexpected response content type on page ${page}: ${typeName(rawContent)}`,
      );
      break;
    }

    let jsonData: unknown;
    try {
      jsonData = JSON.parse(content);
    } catch (error) {
      if (!content) {
        incomplete(strict, `Empty JSON response content on page ${page}`);
        break;
      }
      incomplete(
        strict,
        `Failed to parse JSON response on page ${page}: ` +
          `${jsonParseErrorMessage(error)} (content: ${truncate(content)})`,
      );
      break;
    }

    if (!isRecord(jsonData)) {
      incomplete(
        strict,
        `Unexpected JSON payload on page ${page} (content: ${truncate(content)})`,
      );
      break;
    }

    const pageAds = jsonData.ads ?? [];
    if (!Array.isArray(pageAds)) {
      incomplete(
        strict,
        `Unexpected 'ads' type on page ${page}: ` +
          `${typeName(pageAds)} value: ${preview(pageAds)}`,
      );
      break;
    }

    const filteredPageAds: PublishedAd[] = [];
    let rejectedCount = 0;
    let rejectedPreview: string | null = null;
    for (const entry of pageAds) {
      if (isRecord(entry) && "id" in entry && "state" in entry) {
        filteredPageAds.push(entry as PublishedAd);
        continue;
      }
      rejectedCount += 1;
      rejectedPreview ??= preview(entry);
    }

    if (rejectedCount > 0) {
      incomplete(
        strict,
        `Filtered ${rejectedCount} malformed ad entries on page ${page} ` +
          `(sample: ${rejectedPreview ?? "<none>"})`,
      );
    }

    ads.push(...filteredPageAds);

    const paging = jsonData.paging;
    if (!isRecord(paging)) {
      break;
    }

    const currentPageNum = coercePageNumber(paging.pageNum);
    const totalPages = coercePageNumber(paging.last);

    if (currentPageNum === null) {
      incomplete(
        strict,
        `Invalid 'pageNum' in paging info: ${String(paging.pageNum)}, ` +
          "stopping pagination",
      );
      break;
    }

    if (totalPages !== null && currentPageNum >= totalPages) {
      break;
    }

    if (pageAds.length === 0) {
      break;
    }

    const nextPage = coercePageNumber(paging.next);
    if (nextPage === null) {
      if (totalPages !== null) {
        incomplete(
          strict,
          `Invalid 'next' page value in paging info: ${String(paging.next)}, ` +
            "stopping pagination",
        );
      } else {
        incomplete(
          strict,
          `No 'next' in paging on page ${page}, assuming last page`,
        );
      }
      break;
    }
    page = nextPage;
  }

  return ads;
}

const RECOVERY_DELAYS_MS = [0, 1_000, 2_000, 4_000];

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// After a success page without an ad ID: the one exact-title ad that was not
// published before the submit. Ambiguous or missing results return null.
export async function recoverNewPublishedAdId(
  fetchAds: () => Promise<PublishedAd[]>,
  {
    knownIds,
    sleep,
    title,
  }: {
    knownIds: ReadonlySet<number>;
    sleep: (ms: number) => Promise<void>;
    title: string;
  },
): Promise<number | null> {
  for (const delay of RECOVERY_DELAYS_MS) {
    if (delay > 0) {
      await sleep(delay);
    }
    let ads: PublishedAd[];
    try {
      ads = await fetchAds();
    } catch {
      continue;
    }
    const candidates = new Set<number>();
    for (const ad of ads) {
      const adTitle = typeof ad.title === "string" ? ad.title : null;
      if (adTitle === null || (adTitle !== title && decodeHtmlEntities(adTitle) !== title)) {
        continue;
      }
      const id = Number(ad.id);
      if (Number.isSafeInteger(id) && !knownIds.has(id)) {
        candidates.add(id);
      }
    }
    if (candidates.size === 1) {
      return [...candidates][0]!;
    }
    if (candidates.size > 1) {
      return null;
    }
  }
  return null;
}
