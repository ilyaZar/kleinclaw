/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import assert from "node:assert";
import { currentPageUrl, hasLoggedInMarker, } from "./auth-login-state.js";
import { captchaResolved, SMS_VERIFICATION_XPATH, waitForManualAction, waitForManualCaptcha, } from "./auth-manual-verification.js";
import { isTimeoutLike, resolveLoginOptions, } from "./auth-types.js";
import { CAPTCHA_IFRAME_SELECTOR } from "./publish-form/publish-form-constants.js";
import { checkAndWaitForCaptcha, } from "./publish-form/publish-form-submit-flow.js";
import { By, TimeoutError } from "./web-primitives.js";
async function waitForCondition(controller, condition, { pollIntervalMs, timeout, timeoutErrorMessage, }) {
    const deadline = Date.now() + timeout * 1000;
    while (true) {
        if (await condition()) {
            return;
        }
        if (Date.now() >= deadline) {
            throw new TimeoutError(timeoutErrorMessage);
        }
        await controller.webSleep(pollIntervalMs, pollIntervalMs);
    }
}
async function waitForAuth0Transition(controller, options, { assertionMessage, condition, timeoutMessage, }) {
    try {
        await waitForCondition(controller, condition, {
            pollIntervalMs: options.pollIntervalMs,
            timeout: options.loginDetectionTimeout,
            timeoutErrorMessage: timeoutMessage,
        });
    }
    catch (error) {
        if (isTimeoutLike(error)) {
            throw new assert.AssertionError({
                message: `${assertionMessage} (url=${currentPageUrl(controller)})`,
            });
        }
        throw error;
    }
}
async function waitForAuth0LoginContext(controller, options) {
    await waitForAuth0Transition(controller, options, {
        assertionMessage: "Auth0 redirect not detected",
        condition: () => currentPageUrl(controller)
            .includes("login.kleinanzeigen.de") ||
            currentPageUrl(controller).includes("/u/login"),
        timeoutMessage: `Auth0 redirect did not start within ${options.loginDetectionTimeout} seconds`,
    });
}
async function waitForAuth0PasswordStep(controller, options) {
    await waitForAuth0Transition(controller, options, {
        assertionMessage: "Auth0 password step not reached",
        condition: () => currentPageUrl(controller).includes("/u/login/password"),
        timeoutMessage: `Auth0 password page not reached within ${options.loginDetectionTimeout} seconds`,
    });
}
const SEND_CODE_BUTTON_XPATH = "//button[normalize-space(.)='Code senden' or normalize-space(.)='Send code']";
// The SMS step can follow the password submit (Auth0 custom prompt). On the
// request screen, ask Kleinanzeigen once to text the code to the phone; the
// user types it in the browser, miniclaw never reads or enters it.
async function handleSmsVerification(controller, options) {
    const smsScreen = await controller.webProbe(By.XPATH, SMS_VERIFICATION_XPATH, {
        timeout: options.quickDomTimeout,
    });
    if (smsScreen === null) {
        return false;
    }
    const sendCode = await controller.webProbe(By.XPATH, SEND_CODE_BUTTON_XPATH, {
        timeout: options.quickDomTimeout,
    });
    if (sendCode?.click) {
        await sendCode.click();
        await controller.webSleep();
    }
    const message = "# SMS verification: the code was requested for your phone. " +
        "Please type it in the browser window.";
    if (options.onVerificationPrompt) {
        await options.onVerificationPrompt({ kind: "sms", message });
    }
    else {
        await waitForManualAction(controller, message, async () => isValidPostAuth0Destination(currentPageUrl(controller)), { timeoutSeconds: options.manualActionTimeout });
    }
    return true;
}
function isValidPostAuth0Destination(url) {
    if (!url || url === "unknown" || url === "about:blank") {
        return false;
    }
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return false;
    }
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host !== "kleinanzeigen.de" && !host.endsWith(".kleinanzeigen.de")) {
        return false;
    }
    if (host === "login.kleinanzeigen.de") {
        return false;
    }
    if (path.startsWith("/u/login")) {
        return false;
    }
    return !path.includes("error");
}
async function waitForPostAuth0SubmitTransition(controller, credentials, options) {
    try {
        await waitForCondition(controller, () => isValidPostAuth0Destination(currentPageUrl(controller)), {
            pollIntervalMs: options.pollIntervalMs,
            timeout: options.loginDetectionTimeout,
            timeoutErrorMessage: `Auth0 post-submit transition did not complete within ${options.loginDetectionTimeout} seconds`,
        });
        return;
    }
    catch (error) {
        if (!isTimeoutLike(error)) {
            throw error;
        }
    }
    if (await handleSmsVerification(controller, options)) {
        return;
    }
    if (await hasLoggedInMarker(controller, credentials, options)) {
        return;
    }
    const fallbackMaxMs = Math.max(700, Math.trunc(options.quickDomTimeout * 1000));
    const fallbackMinMs = Math.max(300, Math.trunc(fallbackMaxMs / 2));
    await controller.webSleep(fallbackMinMs, fallbackMaxMs);
    if (await hasLoggedInMarker(controller, credentials, {
        ...options,
        loginDetectionTimeout: options.quickDomTimeout,
    })) {
        return;
    }
    throw new TimeoutError("Auth0 post-submit verification remained inconclusive " +
        `(url=${currentPageUrl(controller)})`);
}
// The visible Auth0 submit; a plain button[type=submit] can hit the hidden
// form-submit button.
export const AUTH0_SUBMIT_SELECTOR = "button[type='submit'][data-action-button-primary='true']" +
    ":not([disabled]):not([aria-disabled='true'])";
const AUTH0_CAPTCHA_TOKEN_JS = "document.querySelector(\"input[name='captcha']\")?.value?.length > 0";
function onPasswordStep(controller) {
    return currentPageUrl(controller).includes("/u/login/password");
}
async function clickAuth0Submit(controller, timeout) {
    try {
        await controller.webClick(By.CSS_SELECTOR, AUTH0_SUBMIT_SELECTOR, timeout);
        await controller.webSleep();
        return true;
    }
    catch (error) {
        if (isTimeoutLike(error)) {
            return false;
        }
        throw error;
    }
}
// After the e-mail step a captcha may hold the identifier page: wait for its
// token and submit; if the page still does not advance, hand over to the user.
async function handleIdentifierCaptchaState(controller, options) {
    if (onPasswordStep(controller)) {
        return;
    }
    await controller.webSleep(1000, 2000);
    if (onPasswordStep(controller)) {
        return;
    }
    const captchaDetected = await controller.webProbe(By.CSS_SELECTOR, CAPTCHA_IFRAME_SELECTOR, { timeout: options.quickDomTimeout }) !== null;
    if (onPasswordStep(controller)) {
        return;
    }
    if (captchaDetected) {
        try {
            await waitForCondition(controller, async () => await controller.webExecute(AUTH0_CAPTCHA_TOKEN_JS) === true, {
                pollIntervalMs: options.pollIntervalMs,
                timeout: options.quickDomTimeout,
                timeoutErrorMessage: "Captcha token did not appear",
            });
            if (onPasswordStep(controller)) {
                return;
            }
            if (await clickAuth0Submit(controller) && onPasswordStep(controller)) {
                return;
            }
        }
        catch (error) {
            if (!isTimeoutLike(error)) {
                throw error;
            }
        }
    }
    else if (await clickAuth0Submit(controller, options.quickDomTimeout) &&
        onPasswordStep(controller)) {
        return;
    }
    await waitForManualCaptcha(controller, options, async () => onPasswordStep(controller) || await captchaResolved(controller));
    if (!onPasswordStep(controller)) {
        await clickAuth0Submit(controller, options.quickDomTimeout);
    }
}
// A captcha can also appear after the password was submitted; let the user
// solve it and submit again if the page did not move on by itself.
async function handlePostPasswordCaptcha(controller, options) {
    if (!onPasswordStep(controller)) {
        return;
    }
    const captcha = await controller.webProbe(By.CSS_SELECTOR, CAPTCHA_IFRAME_SELECTOR, {
        timeout: options.captchaDetectionTimeout,
    });
    if (captcha === null || !onPasswordStep(controller)) {
        return;
    }
    await waitForManualCaptcha(controller, options, async () => !onPasswordStep(controller) || await captchaResolved(controller));
    if (onPasswordStep(controller)) {
        await clickAuth0Submit(controller, options.quickDomTimeout);
    }
}
export async function fillLoginDataAndSend(controller, credentials, options = {}) {
    const resolvedOptions = resolveLoginOptions(options);
    await waitForAuth0LoginContext(controller, resolvedOptions);
    await controller.webInput(By.ID, "username", credentials.username);
    await clickAuth0Submit(controller);
    await handleIdentifierCaptchaState(controller, resolvedOptions);
    await waitForAuth0PasswordStep(controller, resolvedOptions);
    await controller.webInput(By.CSS_SELECTOR, "input[type='password']", credentials.password);
    await checkAndWaitForCaptcha(controller, {
        captchaDetectionTimeout: resolvedOptions.captchaDetectionTimeout,
        isLoginPage: true,
        onManualCaptcha: () => waitForManualCaptcha(controller, resolvedOptions),
    });
    if (!await clickAuth0Submit(controller)) {
        throw new TimeoutError("Auth0 password submit button not found");
    }
    await handlePostPasswordCaptcha(controller, resolvedOptions);
    await waitForPostAuth0SubmitTransition(controller, credentials, resolvedOptions);
}
