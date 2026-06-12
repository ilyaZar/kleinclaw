/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { DownloadAdExtractor, } from "../download-extractor.js";
import { By, TimeoutError, } from "../web-primitives.js";
export async function navigateToDownloadedAdPage(controller, rootUrl, context) {
    const pageUrl = context.adUrl ??
        `${rootUrl}/s-suchanfrage.html?keywords=${context.adId}`;
    await controller.webOpen(pageUrl);
    await controller.webSleep();
    if (controller.page?.url?.endsWith("k0")) {
        return false;
    }
    try {
        await controller.webFind(By.ID, "vap-ovrly-secure");
        await controller.webClick(By.CLASS_NAME, "mfp-close");
        await controller.webSleep();
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
    return true;
}
export async function downloadAdWithBrowser(config, controller, context) {
    await new DownloadAdExtractor({
        config,
        controller,
        downloadDir: context.downloadDir,
        publishedAdsById: context.publishedAd
            ? new Map([[context.adId, context.publishedAd]])
            : undefined,
    }).downloadAd(context.adId, { active: context.active });
}
