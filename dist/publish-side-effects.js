/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { createBrowserSession, } from "./browser-session.js";
import { login as loginToKleinanzeigen, } from "./auth.js";
import { AdUpdateStrategy, applyAutoPriceReduction, } from "./model/ad-model.js";
import { saveDataFile } from "./io.js";
import { checkPublishingResult, publishAdForm, } from "./publish-form.js";
import { fetchPublishedAds, } from "./published-ads.js";
import { extractOwnAdUrls, } from "./publish-side-effects/ad-overview.js";
import { deletePublishedAd } from "./publish-side-effects/delete-hook.js";
import { downloadAdWithBrowser, navigateToDownloadedAdPage, } from "./publish-side-effects/download-hook.js";
import { extendPublishedAd } from "./publish-side-effects/extend-hook.js";
import { createLoginDiagnosticsCapture, createPublishDiagnosticsCapture, createTimingCollector, } from "./publish-side-effects/factory-support.js";
import { TimeoutError, WebController, } from "./web-primitives.js";
async function waitForPublishingResult(controller, timeout) {
    const deadline = Date.now() + timeout * 1000;
    do {
        if (await checkPublishingResult(controller)) {
            return;
        }
        await controller.webSleep(500, 800);
    } while (Date.now() < deadline);
    throw new TimeoutError("Publishing result was not confirmed");
}
async function runPublishForm(controller, context, mode, { formOptions, now, publishAdFormImpl, rootUrl, saveAdConfig, }) {
    applyAutoPriceReduction(context.ad, {
        mode,
        now: now(),
    });
    await (publishAdFormImpl ?? publishAdForm)(controller, context.ad, {
        ...formOptions,
        adConfig: context.raw,
        adFile: context.adFile,
        mode,
        now,
        rootUrl,
        saveAdConfig,
    });
}
export async function createBrowserPublishUpdateSideEffects(config, { allowLiveBrowser = false, command = "browser", configPath, controller, diagnosticsDir, driver, loginBeforeCommands = true, loginOptions, logFilePath, now = () => new Date(), publishingResultTimeout, paginationFollowUpTimeout, paginationInitialTimeout, rootUrl = "https://www.kleinanzeigen.de", saveAdConfig = saveDataFile, session, sessionTimeout, strictPublishedAds = false, timingCollector, webControllerOptions, publishAdFormImpl, ...formOptions } = {}) {
    const timeouts = config.timeouts;
    const resolvedFormOptions = {
        ...formOptions,
        captchaDetectionTimeout: formOptions.captchaDetectionTimeout ??
            timeouts.resolve("captchaDetection"),
        confirmationTimeout: formOptions.confirmationTimeout ??
            timeouts.resolve("publishingConfirmation"),
        imageUploadTimeout: formOptions.imageUploadTimeout ?? timeouts.resolve("imageUpload"),
        quickDomTimeout: formOptions.quickDomTimeout ?? timeouts.resolve("quickDom"),
    };
    const resolvedPaginationFollowUpTimeout = paginationFollowUpTimeout ?? timeouts.resolve("paginationFollowUp");
    const resolvedPaginationInitialTimeout = paginationInitialTimeout ?? timeouts.resolve("paginationInitial");
    const resolvedPublishingResultTimeout = publishingResultTimeout ?? timeouts.resolve("publishingResult");
    const resolvedSessionTimeout = sessionTimeout ?? timeouts.resolve("chromeRemoteDebugging");
    const activeTimingCollector = timingCollector ?? createTimingCollector(config, {
        command,
        configPath,
        diagnosticsDir,
        now,
    });
    const resolvedWebControllerOptions = {
        ...webControllerOptions,
        defaultTimeout: webControllerOptions?.defaultTimeout ?? timeouts.resolve("default"),
        timeoutConfig: webControllerOptions?.timeoutConfig ?? timeouts,
        timingCollector: webControllerOptions?.timingCollector ?? activeTimingCollector,
    };
    const activeSession = session ?? (controller
        ? null
        : await createBrowserSession(config, {
            allowLiveBrowser,
            driver,
            timeout: resolvedSessionTimeout,
        }));
    const activeController = controller ??
        new WebController(activeSession.page, resolvedWebControllerOptions);
    const loginDiagnostics = createLoginDiagnosticsCapture(config, {
        configPath,
        controller: activeController,
        diagnosticsDir,
        logFilePath,
        now,
    });
    const publishDiagnostics = createPublishDiagnosticsCapture(config, {
        configPath,
        controller: activeController,
        diagnosticsDir,
        logFilePath,
        now,
    });
    try {
        if (loginBeforeCommands) {
            await loginToKleinanzeigen(activeController, config.login, {
                captchaDetectionTimeout: resolvedFormOptions.captchaDetectionTimeout,
                emailVerificationTimeout: timeouts.resolve("emailVerification"),
                loginDetectionTimeout: timeouts.resolve("loginDetection"),
                onManualCaptcha: resolvedFormOptions.onManualCaptcha,
                pageLoadTimeout: timeouts.resolve("pageLoad"),
                quickDomTimeout: resolvedFormOptions.quickDomTimeout,
                rootUrl,
                smsVerificationTimeout: timeouts.resolve("smsVerification"),
                ...loginOptions,
                captureDiagnostics: loginOptions?.captureDiagnostics ?? loginDiagnostics,
            });
        }
    }
    catch (error) {
        activeTimingCollector?.flush?.();
        if (activeSession) {
            try {
                await activeSession.close();
            }
            catch {
                // Preserve the login failure; cleanup is best-effort here.
            }
        }
        throw error;
    }
    return {
        captureError: publishDiagnostics,
        close: async () => {
            activeTimingCollector?.flush?.();
            if (activeSession) {
                await activeSession.close();
            }
        },
        deleteAd: (context) => deletePublishedAd(activeController, rootUrl, context),
        downloadAd: (context) => downloadAdWithBrowser(config, activeController, context),
        extendAd: (context) => extendPublishedAd(activeController, rootUrl, context, {
            paginationFollowUpTimeout: resolvedPaginationFollowUpTimeout,
            paginationInitialTimeout: resolvedPaginationInitialTimeout,
            quickDomTimeout: resolvedFormOptions.quickDomTimeout,
        }),
        extractOwnAdsUrls: () => extractOwnAdUrls(activeController, rootUrl, {
            paginationFollowUpTimeout: resolvedPaginationFollowUpTimeout,
            paginationInitialTimeout: resolvedPaginationInitialTimeout,
        }),
        fetchPublishedAds: () => fetchPublishedAds((url) => activeController.webRequest(url), { rootUrl, strict: strictPublishedAds }),
        navigateToAdPage: (context) => navigateToDownloadedAdPage(activeController, rootUrl, context),
        publishAd: (context) => runPublishForm(activeController, context, AdUpdateStrategy.Replace, {
            formOptions: resolvedFormOptions,
            now,
            publishAdFormImpl,
            rootUrl,
            saveAdConfig,
        }),
        updateAd: (context) => runPublishForm(activeController, context, AdUpdateStrategy.Modify, {
            formOptions: resolvedFormOptions,
            now,
            publishAdFormImpl,
            rootUrl,
            saveAdConfig,
        }),
        waitForPublishingResult: () => waitForPublishingResult(activeController, resolvedPublishingResultTimeout),
    };
}
