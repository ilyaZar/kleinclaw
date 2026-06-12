/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { ValidationError } from "./validation-error.js";
export class TimeoutConfig {
    multiplier;
    default;
    pageLoad;
    captchaDetection;
    smsVerification;
    emailVerification;
    loginDetection;
    publishingResult;
    publishingConfirmation;
    imageUpload;
    paginationInitial;
    paginationFollowUp;
    quickDom;
    updateCheck;
    chromeRemoteProbe;
    chromeRemoteDebugging;
    chromeBinaryDetection;
    retryEnabled;
    retryMaxAttempts;
    retryBackoffFactor;
    constructor(input = {}) {
        this.multiplier = input.multiplier ?? 1;
        this.default = input.default ?? 5;
        this.pageLoad = input.pageLoad ?? input.page_load ?? 15;
        this.captchaDetection =
            input.captchaDetection ?? input.captcha_detection ?? 2;
        this.smsVerification =
            input.smsVerification ?? input.sms_verification ?? 5;
        this.emailVerification =
            input.emailVerification ?? input.email_verification ?? 5;
        this.loginDetection =
            input.loginDetection ?? input.login_detection ?? 12;
        this.publishingResult =
            input.publishingResult ?? input.publishing_result ?? 300;
        this.publishingConfirmation =
            input.publishingConfirmation ?? input.publishing_confirmation ?? 20;
        this.imageUpload = input.imageUpload ?? input.image_upload ?? 30;
        this.paginationInitial =
            input.paginationInitial ?? input.pagination_initial ?? 10;
        this.paginationFollowUp =
            input.paginationFollowUp ?? input.pagination_follow_up ?? 5;
        this.quickDom = input.quickDom ?? input.quick_dom ?? 2;
        this.updateCheck = input.updateCheck ?? input.update_check ?? 10;
        this.chromeRemoteProbe =
            input.chromeRemoteProbe ?? input.chrome_remote_probe ?? 2;
        this.chromeRemoteDebugging =
            input.chromeRemoteDebugging ?? input.chrome_remote_debugging ?? 5;
        this.chromeBinaryDetection =
            input.chromeBinaryDetection ?? input.chrome_binary_detection ?? 10;
        this.retryEnabled = input.retryEnabled ?? input.retry_enabled ?? true;
        this.retryMaxAttempts =
            input.retryMaxAttempts ?? input.retry_max_attempts ?? 2;
        this.retryBackoffFactor =
            input.retryBackoffFactor ?? input.retry_backoff_factor ?? 1.5;
        this.validate();
    }
    resolve(key = "default", override) {
        if (override !== null && override !== undefined) {
            return Number(override);
        }
        return this[key];
    }
    effective(key = "default", override, { attempt = 0, } = {}) {
        const base = this.resolve(key, override);
        const backoff = attempt > 0 ? this.retryBackoffFactor ** attempt : 1;
        return base * this.multiplier * backoff;
    }
    attempts() {
        return this.retryEnabled ? 1 + this.retryMaxAttempts : 1;
    }
    validate() {
        validateNumber("timeouts.multiplier", this.multiplier, 0.1);
        validateNumber("timeouts.default", this.default, 0);
        validateNumber("timeouts.page_load", this.pageLoad, 1);
        validateNumber("timeouts.captcha_detection", this.captchaDetection, 0.1);
        validateNumber("timeouts.sms_verification", this.smsVerification, 0.1);
        validateNumber("timeouts.email_verification", this.emailVerification, 0.1);
        validateNumber("timeouts.login_detection", this.loginDetection, 1);
        validateNumber("timeouts.publishing_result", this.publishingResult, 10);
        validateNumber("timeouts.publishing_confirmation", this.publishingConfirmation, 1);
        validateNumber("timeouts.image_upload", this.imageUpload, 5);
        validateNumber("timeouts.pagination_initial", this.paginationInitial, 1);
        validateNumber("timeouts.pagination_follow_up", this.paginationFollowUp, 1);
        validateNumber("timeouts.quick_dom", this.quickDom, 0.1);
        validateNumber("timeouts.update_check", this.updateCheck, 1);
        validateNumber("timeouts.chrome_remote_probe", this.chromeRemoteProbe, 0.1);
        validateNumber("timeouts.chrome_remote_debugging", this.chromeRemoteDebugging, 1);
        validateNumber("timeouts.chrome_binary_detection", this.chromeBinaryDetection, 1);
        validateInteger("timeouts.retry_max_attempts", this.retryMaxAttempts, 1);
        validateNumber("timeouts.retry_backoff_factor", this.retryBackoffFactor, 1);
    }
}
function validateNumber(name, value, min) {
    if (!Number.isFinite(value) || value < min) {
        throw new ValidationError(`${name} must be greater than or equal to ${min}`);
    }
}
function validateInteger(name, value, min) {
    if (!Number.isInteger(value) || value < min) {
        throw new ValidationError(`${name} must be an integer >= ${min}`);
    }
}
