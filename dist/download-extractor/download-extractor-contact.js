/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { extractAdIdFromAdUrl } from "../ad-identity.js";
import { isRecord } from "../value-guards.js";
import { By, TimeoutError, } from "../web-primitives.js";
export function extractSellDirectlyFromAdPage(pageUrl, publishedAdsById) {
    try {
        const currentAdId = extractAdIdFromAdUrl(pageUrl);
        if (currentAdId === -1) {
            return null;
        }
        const cachedAd = publishedAdsById.get(currentAdId);
        if (!isRecord(cachedAd)) {
            return null;
        }
        const buyNowEligible = cachedAd?.buyNowEligible;
        return typeof buyNowEligible === "boolean" ? buyNowEligible : null;
    }
    catch {
        return null;
    }
}
// Classic layout: the name sits in #viewad-contact .iconlist-text. The
// redesigned layout only shows initials there, so its island name wins.
async function classicContactName(controller, islandContactName) {
    if (islandContactName && controller.webProbe &&
        await controller.webProbe(By.CSS_SELECTOR, "#viewad-contact .iconlist-text") === null) {
        return null;
    }
    try {
        const contactPersonElement = await controller.webFind(By.ID, "viewad-contact");
        const nameElement = await controller.webFind(By.CLASS_NAME, "iconlist-text", { parent: contactPersonElement });
        try {
            return await controller.webText(By.TAG_NAME, "a", { parent: nameElement });
        }
        catch (error) {
            if (!(error instanceof TimeoutError)) {
                throw error;
            }
            return await controller.webText(By.TAG_NAME, "span", { parent: nameElement });
        }
    }
    catch (error) {
        if (error instanceof TimeoutError) {
            return null;
        }
        throw error;
    }
}
export async function extractContactFromAdPage(controller, islandContactName = null) {
    const contact = {};
    const addressText = await controller.webText(By.ID, "viewad-locality");
    try {
        const street = await controller.webText(By.ID, "street-address");
        contact.street = street.slice(0, -1);
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
    const [zipcode, ...locationParts] = addressText.split(" ");
    contact.zipcode = zipcode ?? "";
    contact.location = locationParts.join(" ");
    contact.name = await classicContactName(controller, islandContactName) ??
        islandContactName ?? "";
    if (!("street" in contact)) {
        contact.street = null;
    }
    try {
        const phoneElement = await controller.webFind(By.ID, "viewad-contact-phone");
        const phoneNumber = await controller.webText(By.TAG_NAME, "a", { parent: phoneElement });
        contact.phone = phoneNumber
            .replaceAll("-", " ")
            .split(" ")
            .join("")
            .replace("+49(0)", "0");
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
        contact.phone = null;
    }
    return contact;
}
