/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { callPageScript, CSRF_TOKEN_SCRIPT } from "../web/page-scripts.js";
function publishedAdId(value) {
    if (typeof value === "number" && Number.isInteger(value)) {
        return value;
    }
    if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
        return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
}
// An ad with an ID deletes exactly that ID. Title matching only applies to
// ID-less ads and fails closed when the title matches several published ads.
export function deletionTargetIds(ad, publishedAds, deleteOldAdsByTitle) {
    if (ad.id !== null) {
        return [ad.id];
    }
    if (!deleteOldAdsByTitle) {
        return [];
    }
    const ids = new Set();
    for (const publishedAd of publishedAds) {
        const id = publishedAdId(publishedAd.id);
        if (id !== null && publishedAd.title === ad.title) {
            ids.add(id);
        }
    }
    return ids.size === 1 ? [...ids] : [];
}
export async function deletePublishedAd(controller, rootUrl, { ad, deleteOldAdsByTitle, publishedAds, }) {
    const targetIds = deletionTargetIds(ad, publishedAds, deleteOldAdsByTitle);
    if (targetIds.length === 0) {
        return false;
    }
    await controller.webOpen(`${rootUrl}/m-meine-anzeigen.html`);
    const csrfToken = await controller.webExecute(callPageScript(CSRF_TOKEN_SCRIPT));
    if (typeof csrfToken !== "string" || !csrfToken.trim()) {
        throw new Error("Expected CSRF Token not found in HTML content!");
    }
    let deleted = false;
    for (const targetId of targetIds) {
        const response = await controller.webRequest(`${rootUrl}/m-anzeigen-loeschen.json?ids=${targetId}`, "POST", [200, 404], { "x-csrf-token": csrfToken });
        if (response.statusCode === 200) {
            deleted = true;
        }
    }
    ad.id = null;
    await controller.webSleep();
    return deleted;
}
