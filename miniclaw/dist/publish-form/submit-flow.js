/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { By, Is, TimeoutError } from "../web-primitives.js";
import { CAPTCHA_IFRAME_SELECTOR, CONFIRMATION_URL_FRAGMENT, IMPRINT_GUIDANCE_SUBMIT_ID, NO_IMAGE_HINT_BUTTON_XPATH, PAYMENT_FORM_ID, SUBMIT_BUTTON_XPATH, TRACKING_SCRIPT_TEXT_JS, } from "./constants.js";
import { CaptchaEncountered, PublishSubmissionUncertainError, } from "./errors.js";
import { clickElement } from "./element-helpers.js";
export async function checkAndWaitForCaptcha(controller, { autoRestart = false, captchaDetectionTimeout, isLoginPage = true, onManualCaptcha, restartDelaySeconds = null, scrollPageDown, } = {}) {
    const captchaElement = await controller.webProbe(By.CSS_SELECTOR, CAPTCHA_IFRAME_SELECTOR, { timeout: captchaDetectionTimeout });
    if (captchaElement === null) {
        return false;
    }
    if (!isLoginPage && autoRestart) {
        throw new CaptchaEncountered(restartDelaySeconds);
    }
    if (!isLoginPage && scrollPageDown) {
        await scrollPageDown();
    }
    if (onManualCaptcha) {
        await onManualCaptcha();
    }
    return true;
}
export function parseConfirmationAdId(url) {
    if (!url.includes(CONFIRMATION_URL_FRAGMENT)) {
        return null;
    }
    const parsed = new URL(url, "https://www.kleinanzeigen.de");
    const adId = parsed.searchParams.get("adId");
    if (!adId || !/^\d+$/.test(adId)) {
        return null;
    }
    const numericAdId = Number.parseInt(adId, 10);
    return Number.isFinite(numericAdId) ? numericAdId : null;
}
export async function recoverAdIdFromRedirect(controller) {
    let referrer = "";
    try {
        referrer = String(await controller.webExecute("document.referrer") ?? "");
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
    const referrerAdId = parseConfirmationAdId(referrer);
    if (referrerAdId !== null) {
        return referrerAdId;
    }
    try {
        const scriptContent = String(await controller.webExecute(TRACKING_SCRIPT_TEXT_JS) ?? "");
        const match = /p-anzeige-aufgeben-bestaetigung\.html\?adId=(\d+)/
            .exec(scriptContent);
        return match ? Number.parseInt(match[1], 10) : null;
    }
    catch (error) {
        if (error instanceof TimeoutError) {
            return null;
        }
        throw error;
    }
}
async function waitForCondition(controller, condition, timeout = 30) {
    const deadline = Date.now() + timeout * 1000;
    do {
        if (await condition()) {
            return;
        }
        await controller.webSleep(500, 800);
    } while (Date.now() < deadline);
    throw new TimeoutError("Condition not met");
}
async function waitForConfirmationUrl(controller, { confirmationTimeout = 30, waitForConfirmation, } = {}) {
    const checkConfirmationUrl = async () => {
        const url = String(await controller.webExecute("window.location.href"));
        return url.includes(CONFIRMATION_URL_FRAGMENT);
    };
    if (waitForConfirmation) {
        await waitForConfirmation(checkConfirmationUrl, {
            timeout: confirmationTimeout,
        });
    }
    else {
        await waitForCondition(controller, checkConfirmationUrl, confirmationTimeout);
    }
    const currentUrl = String(await controller.webExecute("window.location.href"));
    const adId = parseConfirmationAdId(currentUrl);
    if (adId === null) {
        throw new TimeoutError("Confirmation URL did not contain an ad ID");
    }
    return adId;
}
async function handlePostSubmitPrompts(controller, ad, { onPaymentForm, quickDomTimeout, } = {}) {
    const imprintButton = await controller.webProbe(By.ID, IMPRINT_GUIDANCE_SUBMIT_ID, { timeout: quickDomTimeout });
    if (imprintButton !== null) {
        await clickElement(imprintButton, "Unable to submit imprint guidance");
    }
    if (ad.images.length === 0) {
        const imageHintButton = await controller.webProbe(By.XPATH, NO_IMAGE_HINT_BUTTON_XPATH, { timeout: quickDomTimeout });
        if (imageHintButton !== null) {
            await clickElement(imageHintButton, "Unable to confirm publish without image");
        }
    }
    const paymentForm = await controller.webProbe(By.ID, PAYMENT_FORM_ID, { timeout: quickDomTimeout });
    if (paymentForm !== null && onPaymentForm) {
        await onPaymentForm();
    }
}
export async function submitAdForm(controller, ad, options = {}) {
    await controller.webClick(By.XPATH, SUBMIT_BUTTON_XPATH);
    try {
        await handlePostSubmitPrompts(controller, ad, options);
        return await waitForConfirmationUrl(controller, options);
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
        let adId = null;
        try {
            adId = options.recoverAdId
                ? await options.recoverAdId()
                : await recoverAdIdFromRedirect(controller);
        }
        catch {
            adId = null;
        }
        if (adId === null) {
            throw new PublishSubmissionUncertainError();
        }
        return adId;
    }
}
export async function checkPublishingResult(controller) {
    const isDisplayed = async (id) => {
        try {
            return await controller.webCheck(By.ID, id, Is.DISPLAYED);
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                return false;
            }
            throw error;
        }
    };
    return await isDisplayed("checking-done") ||
        await isDisplayed("not-completed");
}
