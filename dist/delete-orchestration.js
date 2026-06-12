/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
const RESET_FIELDS = [
    "id",
    "created_on",
    "createdOn",
    "updated_on",
    "updatedOn",
    "content_hash",
    "contentHash",
    "repost_count",
    "repostCount",
    "price_reduction_count",
    "priceReductionCount",
];
function deleteEvent(loadedAd, status) {
    return {
        adFile: loadedAd.filePath,
        adId: loadedAd.ad.id,
        relativePath: loadedAd.relativePath,
        status,
        title: loadedAd.ad.title,
    };
}
export function applyAfterDeletePolicy(ad, raw, mode) {
    if (mode === "NONE") {
        return false;
    }
    if (mode === "RESET") {
        for (const field of RESET_FIELDS) {
            delete raw[field];
        }
        ad.id = null;
        ad.createdOn = null;
        ad.updatedOn = null;
        ad.contentHash = null;
        ad.repostCount = 0;
        ad.priceReductionCount = 0;
        return true;
    }
    if (mode === "DISABLE") {
        ad.active = false;
        raw.active = false;
        return true;
    }
    return false;
}
export async function runDeleteAdsBatch(loadedAds, { afterDelete = "NONE", deleteAd, deleteOldAdsByTitle = false, publishedAds = [], saveAdConfig, sleep, }) {
    const result = {
        cleanupApplied: 0,
        deleted: 0,
        events: [],
        processed: 0,
        total: loadedAds.length,
    };
    for (const loadedAd of loadedAds) {
        result.processed += 1;
        const idBefore = loadedAd.ad.id;
        const deleted = Boolean(await deleteAd({
            ad: loadedAd.ad,
            adFile: loadedAd.filePath,
            deleteOldAdsByTitle,
            publishedAds,
            raw: loadedAd.raw,
            relativePath: loadedAd.relativePath,
        }));
        if (deleted) {
            result.deleted += 1;
            result.events.push(deleteEvent(loadedAd, "deleted"));
        }
        const deleteAttempted = deleted ||
            (idBefore !== null && loadedAd.ad.id === null);
        if (deleteAttempted && afterDelete !== "NONE") {
            if (applyAfterDeletePolicy(loadedAd.ad, loadedAd.raw, afterDelete)) {
                result.cleanupApplied += 1;
                result.events.push(deleteEvent(loadedAd, "cleanup"));
                if (saveAdConfig) {
                    await saveAdConfig(loadedAd.filePath, loadedAd.raw);
                }
            }
        }
        else if (!deleted) {
            result.events.push(deleteEvent(loadedAd, deleteAttempted ? "not-found" : "not-attempted"));
        }
        if (sleep) {
            await sleep();
        }
    }
    return result;
}
