/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { By } from "../web-primitives.js";
import { csrfTokenFromElement } from "./browser-elements.js";
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
function deletionTargetIds(ad, publishedAds, deleteOldAdsByTitle) {
    const ids = new Set();
    if (deleteOldAdsByTitle) {
        for (const publishedAd of publishedAds) {
            const id = publishedAdId(publishedAd.id);
            if (id === null) {
                continue;
            }
            if (ad.id === id || publishedAd.title === ad.title) {
                ids.add(id);
            }
        }
    }
    else if (ad.id !== null) {
        ids.add(ad.id);
    }
    return [...ids].sort((left, right) => left - right);
}
export async function deletePublishedAd(controller, rootUrl, { ad, deleteOldAdsByTitle, publishedAds, }) {
    const targetIds = deletionTargetIds(ad, publishedAds, deleteOldAdsByTitle);
    if (targetIds.length === 0) {
        return false;
    }
    await controller.webOpen(`${rootUrl}/m-meine-anzeigen.html`);
    const csrfElement = await controller.webFind(By.CSS_SELECTOR, "meta[name=_csrf]");
    const csrfToken = await csrfTokenFromElement(csrfElement);
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
