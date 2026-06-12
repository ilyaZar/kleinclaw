/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { idsMatch } from "./ad-identity.js";
export const EXTEND_WINDOW_DAYS = 8;
function findPublishedAd(ad, publishedAds) {
    return publishedAds.find((publishedAd) => idsMatch(ad.id, publishedAd.id)) ?? null;
}
function dateOnlyMillis(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf();
}
export function parseGermanDate(value) {
    if (typeof value !== "string") {
        return null;
    }
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
    if (!match) {
        return null;
    }
    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day) {
        return null;
    }
    return parsed;
}
export function daysUntilEndDate(endDate, now = new Date()) {
    const millisPerDay = 24 * 60 * 60 * 1000;
    return Math.round((dateOnlyMillis(endDate) - dateOnlyMillis(now)) / millisPerDay);
}
function formatUtcIsoSeconds(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}
function eventFor(loadedAd, status, daysUntilExpiry) {
    const event = {
        adFile: loadedAd.filePath,
        adId: loadedAd.ad.id,
        relativePath: loadedAd.relativePath,
        status,
        title: loadedAd.ad.title,
    };
    if (daysUntilExpiry !== undefined) {
        event.daysUntilExpiry = daysUntilExpiry;
    }
    return event;
}
function markSkipped(result, loadedAd, status, daysUntilExpiry) {
    result.skipped += 1;
    result.events.push(eventFor(loadedAd, status, daysUntilExpiry));
}
export async function runExtendAdsBatch(loadedAds, { extendAd, now = new Date(), publishedAds = [], saveAdConfig, sleep, }) {
    const result = {
        attempted: 0,
        events: [],
        extended: 0,
        skipped: 0,
        total: loadedAds.length,
    };
    for (const loadedAd of loadedAds) {
        if (!loadedAd.ad.id) {
            markSkipped(result, loadedAd, "skipped-unpublished");
            continue;
        }
        const publishedAd = findPublishedAd(loadedAd.ad, publishedAds);
        if (!publishedAd) {
            markSkipped(result, loadedAd, "skipped-missing");
            continue;
        }
        if (publishedAd.state !== "active") {
            markSkipped(result, loadedAd, "skipped-inactive");
            continue;
        }
        const endDate = parseGermanDate(publishedAd.endDate);
        if (!endDate) {
            markSkipped(result, loadedAd, "skipped-end-date");
            continue;
        }
        const daysUntilExpiry = daysUntilEndDate(endDate, now);
        if (daysUntilExpiry > EXTEND_WINDOW_DAYS) {
            markSkipped(result, loadedAd, "skipped-outside-window", daysUntilExpiry);
            continue;
        }
        result.attempted += 1;
        const extended = Boolean(await extendAd({
            ad: loadedAd.ad,
            adFile: loadedAd.filePath,
            publishedAd,
            raw: loadedAd.raw,
            relativePath: loadedAd.relativePath,
        }));
        if (extended) {
            result.extended += 1;
            loadedAd.raw.updated_on = formatUtcIsoSeconds(now);
            loadedAd.ad.updatedOn = now;
            if (saveAdConfig) {
                await saveAdConfig(loadedAd.filePath, loadedAd.raw);
            }
            result.events.push(eventFor(loadedAd, "extended", daysUntilExpiry));
        }
        else {
            result.events.push(eventFor(loadedAd, "failed", daysUntilExpiry));
        }
        if (sleep) {
            await sleep();
        }
    }
    return result;
}
