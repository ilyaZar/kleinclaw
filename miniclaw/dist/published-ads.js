/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { isRecord } from "./value-guards.js";
const MAX_PAGE_LIMIT = 100;
const SNIPPET_LIMIT = 500;
export class PublishedAdsFetchIncompleteError extends Error {
    constructor(message) {
        super(message);
        this.name = "PublishedAdsFetchIncompleteError";
    }
}
function typeName(value) {
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
function truncate(text) {
    return text.length > SNIPPET_LIMIT
        ? `${text.slice(0, SNIPPET_LIMIT)}...`
        : text;
}
function preview(value) {
    return truncate(typeof value === "string" ? value : String(value));
}
function contentToString(content) {
    if (content instanceof Uint8Array) {
        return Buffer.from(content).toString("utf8");
    }
    if (typeof content === "string") {
        return content;
    }
    return null;
}
function incomplete(strict, message) {
    if (strict) {
        throw new PublishedAdsFetchIncompleteError(message);
    }
}
function jsonParseErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function coercePageNumber(value) {
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
export function publishedAdsPageUrl(rootUrl, page) {
    return `${rootUrl}/m-meine-anzeigen-verwalten.json?sort=DEFAULT&pageNum=${page}`;
}
export async function fetchPublishedAds(webRequest, { rootUrl = "https://www.kleinanzeigen.de", strict = false, maxPageLimit = MAX_PAGE_LIMIT, } = {}) {
    const ads = [];
    let page = 1;
    while (true) {
        if (page > maxPageLimit) {
            incomplete(strict, `Stopping pagination after ${maxPageLimit} pages to avoid infinite loop`);
            break;
        }
        let response;
        try {
            response = await webRequest(publishedAdsPageUrl(rootUrl, page));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            incomplete(strict, `Pagination request failed on page ${page}: ${message}`);
            break;
        }
        if (!isRecord(response)) {
            incomplete(strict, `Unexpected pagination response type on page ${page}: ${typeName(response)}`);
            break;
        }
        const rawContent = response.content ?? "";
        const content = contentToString(rawContent);
        if (content === null) {
            incomplete(strict, `Unexpected response content type on page ${page}: ${typeName(rawContent)}`);
            break;
        }
        let jsonData;
        try {
            jsonData = JSON.parse(content);
        }
        catch (error) {
            if (!content) {
                incomplete(strict, `Empty JSON response content on page ${page}`);
                break;
            }
            incomplete(strict, `Failed to parse JSON response on page ${page}: ` +
                `${jsonParseErrorMessage(error)} (content: ${truncate(content)})`);
            break;
        }
        if (!isRecord(jsonData)) {
            incomplete(strict, `Unexpected JSON payload on page ${page} (content: ${truncate(content)})`);
            break;
        }
        const pageAds = jsonData.ads ?? [];
        if (!Array.isArray(pageAds)) {
            incomplete(strict, `Unexpected 'ads' type on page ${page}: ` +
                `${typeName(pageAds)} value: ${preview(pageAds)}`);
            break;
        }
        const filteredPageAds = [];
        let rejectedCount = 0;
        let rejectedPreview = null;
        for (const entry of pageAds) {
            if (isRecord(entry) && "id" in entry && "state" in entry) {
                filteredPageAds.push(entry);
                continue;
            }
            rejectedCount += 1;
            rejectedPreview ??= preview(entry);
        }
        if (rejectedCount > 0) {
            incomplete(strict, `Filtered ${rejectedCount} malformed ad entries on page ${page} ` +
                `(sample: ${rejectedPreview ?? "<none>"})`);
        }
        ads.push(...filteredPageAds);
        const paging = jsonData.paging;
        if (!isRecord(paging)) {
            break;
        }
        const currentPageNum = coercePageNumber(paging.pageNum);
        const totalPages = coercePageNumber(paging.last);
        if (currentPageNum === null) {
            incomplete(strict, `Invalid 'pageNum' in paging info: ${String(paging.pageNum)}, ` +
                "stopping pagination");
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
                incomplete(strict, `Invalid 'next' page value in paging info: ${String(paging.next)}, ` +
                    "stopping pagination");
            }
            else {
                incomplete(strict, `No 'next' in paging on page ${page}, assuming last page`);
            }
            break;
        }
        page = nextPage;
    }
    return ads;
}
