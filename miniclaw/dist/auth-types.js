/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { hasErrorName } from "./value-guards.js";
import { TimeoutError, } from "./web-primitives.js";
export const DEFAULT_MANUAL_ACTION_TIMEOUT = 300;
export var LoginDetectionReason;
(function (LoginDetectionReason) {
    LoginDetectionReason["USER_INFO_MATCH"] = "USER_INFO_MATCH";
    LoginDetectionReason["CTA_MATCH"] = "CTA_MATCH";
    LoginDetectionReason["SELECTOR_TIMEOUT"] = "SELECTOR_TIMEOUT";
})(LoginDetectionReason || (LoginDetectionReason = {}));
export function resolveLoginOptions(options) {
    return {
        captchaDetectionTimeout: options.captchaDetectionTimeout ?? 2,
        captureDiagnostics: options.captureDiagnostics,
        emailVerificationTimeout: options.emailVerificationTimeout ?? 5,
        loginDetectionTimeout: options.loginDetectionTimeout ?? 12,
        manualActionTimeout: options.manualActionTimeout ?? DEFAULT_MANUAL_ACTION_TIMEOUT,
        onManualCaptcha: options.onManualCaptcha,
        onVerificationPrompt: options.onVerificationPrompt,
        pageLoadTimeout: options.pageLoadTimeout ?? 15,
        pollIntervalMs: options.pollIntervalMs ?? 250,
        quickDomTimeout: options.quickDomTimeout ?? 2,
        rootUrl: options.rootUrl ?? "https://www.kleinanzeigen.de",
        smsVerificationTimeout: options.smsVerificationTimeout ?? 5,
    };
}
export function isTimeoutLike(error) {
    return error instanceof TimeoutError || hasErrorName(error, "TimeoutError");
}
