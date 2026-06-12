/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { extractAdIdFromAdUrl, publishedAdId, } from "./ad-identity.js";
export { extractAdIdFromAdUrl } from "./ad-identity.js";
const NUMERIC_IDS_RE = /^\d+(,\d+)*$/;
export function normalizeDownloadSelector(selector) {
    const selectorTokens = new Set(selector.split(",").map((entry) => entry.trim()).filter(Boolean));
    if (selectorTokens.has("all")) {
        return "all";
    }
    if (selectorTokens.size === 1) {
        return [...selectorTokens][0] ?? selector;
    }
    return selector;
}
export function publishedAdsById(publishedAds) {
    const adsById = new Map();
    for (const publishedAd of publishedAds) {
        const adId = publishedAdId(publishedAd.id);
        if (adId !== null) {
            adsById.set(adId, publishedAd);
        }
    }
    return adsById;
}
export function resolveDownloadAdActivity(adId, adsById) {
    const publishedAd = adsById.get(adId) ?? null;
    if (!publishedAd) {
        return { active: false, owned: false, publishedAd: null };
    }
    return {
        active: publishedAd.state === "active",
        owned: true,
        publishedAd,
    };
}
function savedAdIds(savedAds) {
    const ids = new Set();
    for (const savedAd of savedAds) {
        if (savedAd.ad.id !== null) {
            ids.add(savedAd.ad.id);
        }
    }
    return ids;
}
function event(source, status, adId, adUrl) {
    return { adId, adUrl, source, status };
}
async function downloadResolvedAd({ adId, adUrl, adsById, downloadAd, downloadDir, navigateToAdPage, result, source, }) {
    result.targetCount += 1;
    const exists = await navigateToAdPage({ adId, adUrl, source });
    if (!exists) {
        result.skipped += 1;
        result.events.push(event(source, "skipped-navigation", adId, adUrl));
        return;
    }
    const resolved = resolveDownloadAdActivity(adId, adsById);
    await downloadAd({
        ...resolved,
        adId,
        adUrl,
        downloadDir,
        source,
    });
    result.downloaded += 1;
    result.events.push(event(source, "downloaded", adId, adUrl));
}
async function runOverviewDownload(selector, result, { downloadAd, downloadDir, extractOwnAdsUrls, navigateToAdPage, publishedAds = [], savedAds = [], }) {
    const adsById = publishedAdsById(publishedAds);
    const ownAdUrls = await extractOwnAdsUrls({ downloadDir });
    const savedIds = selector === "new" ? savedAdIds(savedAds) : new Set();
    result.total = ownAdUrls.length;
    for (const adUrl of ownAdUrls) {
        const adId = extractAdIdFromAdUrl(adUrl);
        if (adId === -1) {
            result.skipped += 1;
            result.events.push(event(selector, "skipped-invalid-id", null, adUrl));
            continue;
        }
        if (savedIds.has(adId)) {
            result.skipped += 1;
            result.events.push(event(selector, "skipped-saved", adId, adUrl));
            continue;
        }
        await downloadResolvedAd({
            adId,
            adUrl,
            adsById,
            downloadAd,
            downloadDir,
            navigateToAdPage,
            result,
            source: selector,
        });
    }
}
async function runNumericDownload(selector, result, { downloadAd, downloadDir, navigateToAdPage, publishedAds = [], }) {
    const adsById = publishedAdsById(publishedAds);
    const ids = selector.split(",").map((entry) => Number.parseInt(entry, 10));
    result.total = ids.length;
    for (const adId of ids) {
        await downloadResolvedAd({
            adId,
            adUrl: null,
            adsById,
            downloadAd,
            downloadDir,
            navigateToAdPage,
            result,
            source: "numeric",
        });
    }
}
export async function runDownloadAdsBatch(options) {
    const selector = normalizeDownloadSelector(options.selector);
    const result = {
        downloaded: 0,
        events: [],
        selector,
        skipped: 0,
        targetCount: 0,
        total: 0,
    };
    if (selector === "all" || selector === "new") {
        await runOverviewDownload(selector, result, options);
        return result;
    }
    if (NUMERIC_IDS_RE.test(selector)) {
        await runNumericDownload(selector, result, options);
    }
    return result;
}
