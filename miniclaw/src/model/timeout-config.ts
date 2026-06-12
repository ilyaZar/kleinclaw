/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { ValidationError } from "./validation-error.js";

export interface TimeoutConfigInput {
  multiplier?: number;
  default?: number;
  pageLoad?: number;
  page_load?: number;
  captchaDetection?: number;
  captcha_detection?: number;
  smsVerification?: number;
  sms_verification?: number;
  emailVerification?: number;
  email_verification?: number;
  loginDetection?: number;
  login_detection?: number;
  publishingResult?: number;
  publishing_result?: number;
  publishingConfirmation?: number;
  publishing_confirmation?: number;
  imageUpload?: number;
  image_upload?: number;
  paginationInitial?: number;
  pagination_initial?: number;
  paginationFollowUp?: number;
  pagination_follow_up?: number;
  quickDom?: number;
  quick_dom?: number;
  updateCheck?: number;
  update_check?: number;
  chromeRemoteProbe?: number;
  chrome_remote_probe?: number;
  chromeRemoteDebugging?: number;
  chrome_remote_debugging?: number;
  chromeBinaryDetection?: number;
  chrome_binary_detection?: number;
  retryEnabled?: boolean;
  retry_enabled?: boolean;
  retryMaxAttempts?: number;
  retry_max_attempts?: number;
  retryBackoffFactor?: number;
  retry_backoff_factor?: number;
}

export type TimeoutKey =
  | "default"
  | "pageLoad"
  | "captchaDetection"
  | "smsVerification"
  | "emailVerification"
  | "loginDetection"
  | "publishingResult"
  | "publishingConfirmation"
  | "imageUpload"
  | "paginationInitial"
  | "paginationFollowUp"
  | "quickDom"
  | "updateCheck"
  | "chromeRemoteProbe"
  | "chromeRemoteDebugging"
  | "chromeBinaryDetection";

export class TimeoutConfig {
  readonly multiplier: number;
  readonly default: number;
  readonly pageLoad: number;
  readonly captchaDetection: number;
  readonly smsVerification: number;
  readonly emailVerification: number;
  readonly loginDetection: number;
  readonly publishingResult: number;
  readonly publishingConfirmation: number;
  readonly imageUpload: number;
  readonly paginationInitial: number;
  readonly paginationFollowUp: number;
  readonly quickDom: number;
  readonly updateCheck: number;
  readonly chromeRemoteProbe: number;
  readonly chromeRemoteDebugging: number;
  readonly chromeBinaryDetection: number;
  readonly retryEnabled: boolean;
  readonly retryMaxAttempts: number;
  readonly retryBackoffFactor: number;

  constructor(input: TimeoutConfigInput = {}) {
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

  resolve(key: TimeoutKey = "default", override?: number | null): number {
    if (override !== null && override !== undefined) {
      return Number(override);
    }
    return this[key];
  }

  effective(
    key: TimeoutKey = "default",
    override?: number | null,
    {
      attempt = 0,
    }: {
      attempt?: number;
    } = {},
  ): number {
    const base = this.resolve(key, override);
    const backoff = attempt > 0 ? this.retryBackoffFactor ** attempt : 1;
    return base * this.multiplier * backoff;
  }

  attempts(): number {
    return this.retryEnabled ? 1 + this.retryMaxAttempts : 1;
  }

  private validate(): void {
    validateNumber("timeouts.multiplier", this.multiplier, 0.1);
    validateNumber("timeouts.default", this.default, 0);
    validateNumber("timeouts.page_load", this.pageLoad, 1);
    validateNumber("timeouts.captcha_detection", this.captchaDetection, 0.1);
    validateNumber("timeouts.sms_verification", this.smsVerification, 0.1);
    validateNumber("timeouts.email_verification", this.emailVerification, 0.1);
    validateNumber("timeouts.login_detection", this.loginDetection, 1);
    validateNumber("timeouts.publishing_result", this.publishingResult, 10);
    validateNumber(
      "timeouts.publishing_confirmation",
      this.publishingConfirmation,
      1,
    );
    validateNumber("timeouts.image_upload", this.imageUpload, 5);
    validateNumber("timeouts.pagination_initial", this.paginationInitial, 1);
    validateNumber("timeouts.pagination_follow_up", this.paginationFollowUp, 1);
    validateNumber("timeouts.quick_dom", this.quickDom, 0.1);
    validateNumber("timeouts.update_check", this.updateCheck, 1);
    validateNumber("timeouts.chrome_remote_probe", this.chromeRemoteProbe, 0.1);
    validateNumber(
      "timeouts.chrome_remote_debugging",
      this.chromeRemoteDebugging,
      1,
    );
    validateNumber(
      "timeouts.chrome_binary_detection",
      this.chromeBinaryDetection,
      1,
    );
    validateInteger("timeouts.retry_max_attempts", this.retryMaxAttempts, 1);
    validateNumber("timeouts.retry_backoff_factor", this.retryBackoffFactor, 1);
  }
}

function validateNumber(name: string, value: number, min: number): void {
  if (!Number.isFinite(value) || value < min) {
    throw new ValidationError(`${name} must be greater than or equal to ${min}`);
  }
}

function validateInteger(name: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new ValidationError(`${name} must be an integer >= ${min}`);
  }
}
