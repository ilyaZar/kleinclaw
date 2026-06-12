/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { By, TimeoutError } from "../web-primitives.js";
import { navigatePaginatedAdOverview } from "./ad-overview.js";
export async function extendPublishedAd(controller, rootUrl, context, { paginationFollowUpTimeout, paginationInitialTimeout, quickDomTimeout, } = {}) {
    if (!context.ad.id) {
        return false;
    }
    const extendButtonXPath = `//li[@data-adid="${context.ad.id}"]//button[contains(., "Verlängern")]`;
    const success = await navigatePaginatedAdOverview(controller, `${rootUrl}/m-meine-anzeigen.html`, async () => {
        const extendButton = await controller.webFind(By.XPATH, extendButtonXPath, { timeout: quickDomTimeout });
        if (!extendButton.click) {
            throw new TimeoutError("Extend button cannot be clicked");
        }
        await extendButton.click();
        return true;
    }, {
        paginationFollowUpTimeout,
        paginationInitialTimeout,
    });
    if (!success) {
        return false;
    }
    try {
        await controller.webClick(By.CSS_SELECTOR, 'button[aria-label="Schließen"]', quickDomTimeout);
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
    return true;
}
