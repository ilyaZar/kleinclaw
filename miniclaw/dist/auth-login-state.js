/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { isTimeoutLike, LoginDetectionReason, resolveLoginOptions, } from "./auth-types.js";
import { By, TimeoutError } from "./web-primitives.js";
export const LOGIN_DETECTION_SELECTORS = [
    [By.CLASS_NAME, "mr-medium"],
    [By.ID, "user-email"],
];
export const LOGGED_OUT_CTA_SELECTORS = [
    [By.CSS_SELECTOR, 'a[href*="einloggen"]'],
    [By.CSS_SELECTOR, 'a[href*="/m-einloggen"]'],
];
export class LoginDetectionResult {
    isLoggedIn;
    reason;
    constructor(isLoggedIn, reason) {
        if (isLoggedIn && reason !== LoginDetectionReason.USER_INFO_MATCH) {
            throw new Error("isLoggedIn=true requires reason=USER_INFO_MATCH");
        }
        if (!isLoggedIn && reason === LoginDetectionReason.USER_INFO_MATCH) {
            throw new Error("isLoggedIn=false requires reason=CTA_MATCH or SELECTOR_TIMEOUT");
        }
        this.isLoggedIn = isLoggedIn;
        this.reason = reason;
    }
}
export function currentPageUrl(controller) {
    const url = controller.page?.url;
    if (!url) {
        return "unknown";
    }
    try {
        const parsed = new URL(url);
        const netloc = parsed.port
            ? `${parsed.hostname}:${parsed.port}`
            : parsed.hostname;
        return `${parsed.protocol}//${netloc}${parsed.pathname}` || "unknown";
    }
    catch {
        return "unknown";
    }
}
export async function captureLoginDiagnostics(options, context) {
    if (!options.captureDiagnostics) {
        return;
    }
    try {
        await options.captureDiagnostics(context);
    }
    catch {
        // Diagnostics must not hide the original login boundary failure.
    }
}
async function textFirstAvailable(controller, selectors, timeout, key) {
    if (controller.webTextFirstAvailableOnce) {
        const [text, index] = await controller.webTextFirstAvailableOnce(selectors, {
            key,
            timeout,
        });
        return { index, text };
    }
    if (controller.webTextFirstAvailable) {
        const [text, index] = await controller.webTextFirstAvailable(selectors, {
            timeout,
        });
        return { index, text };
    }
    let lastError = null;
    for (let index = 0; index < selectors.length; index += 1) {
        const selector = selectors[index];
        if (!selector) {
            continue;
        }
        const [type, value] = selector;
        try {
            return {
                index,
                text: await controller.webText(type, value, { timeout }),
            };
        }
        catch (error) {
            if (!isTimeoutLike(error)) {
                throw error;
            }
            lastError = error;
        }
    }
    throw new TimeoutError(`No login selector matched within ${timeout} seconds: ${String(lastError)}`);
}
export async function hasLoggedInMarker(controller, credentials, options) {
    const username = credentials.username.trim().toLowerCase();
    if (!username) {
        return false;
    }
    const { loginDetectionTimeout = 12, quickDomTimeout = 2, } = options;
    try {
        const quickMatch = await textFirstAvailable(controller, LOGIN_DETECTION_SELECTORS, quickDomTimeout, "quickDom");
        if (quickMatch.text.toLowerCase().includes(username)) {
            return true;
        }
    }
    catch (error) {
        if (!isTimeoutLike(error)) {
            throw error;
        }
    }
    try {
        const match = await textFirstAvailable(controller, LOGIN_DETECTION_SELECTORS, loginDetectionTimeout, "loginDetection");
        return match.text.toLowerCase().includes(username);
    }
    catch (error) {
        if (isTimeoutLike(error)) {
            return false;
        }
        throw error;
    }
}
async function hasLoggedOutCta(controller, options) {
    const { quickDomTimeout = 2 } = options;
    try {
        const match = await textFirstAvailable(controller, LOGGED_OUT_CTA_SELECTORS, quickDomTimeout, "quickDom");
        return match.text.trim().length > 0;
    }
    catch (error) {
        if (isTimeoutLike(error)) {
            return false;
        }
        throw error;
    }
}
export async function getLoginState(controller, credentials, { captureSelectorDiagnostics = true, ...options } = {}) {
    const resolvedOptions = resolveLoginOptions(options);
    if (await hasLoggedInMarker(controller, credentials, resolvedOptions)) {
        return new LoginDetectionResult(true, LoginDetectionReason.USER_INFO_MATCH);
    }
    if (await hasLoggedOutCta(controller, resolvedOptions)) {
        return new LoginDetectionResult(false, LoginDetectionReason.CTA_MATCH);
    }
    if (captureSelectorDiagnostics) {
        await captureLoginDiagnostics(resolvedOptions, {
            basePrefix: "login_detection_selector_timeout",
            reason: LoginDetectionReason.SELECTOR_TIMEOUT,
        });
    }
    return new LoginDetectionResult(false, LoginDetectionReason.SELECTOR_TIMEOUT);
}
