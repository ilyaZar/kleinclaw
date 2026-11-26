/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type TimeoutKey } from "./model/timeout-config.js";
import { hasErrorName } from "./value-guards.js";
import {
  type By,
  TimeoutError,
  type WebLocator,
} from "./web-primitives.js";
import { type WebSelector } from "./web/selector.js";

export interface LoginController {
  readonly page?: { url?: string };
  webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
  webExecute(jscode: string): Promise<unknown>;
  webInput(
    type: By,
    value: string,
    text: string,
    timeout?: number,
  ): Promise<WebLocator>;
  webOpen(
    url: string,
    options?: { timeout?: number; reloadIfAlreadyOpen?: boolean },
  ): Promise<void>;
  webProbe(
    type: By,
    value: string,
    options?: { parent?: WebLocator | null; timeout?: number },
  ): Promise<WebLocator | null>;
  webSleep(minMs?: number, maxMs?: number): Promise<void>;
  webText(
    type: By,
    value: string,
    options?: { parent?: WebLocator | null; timeout?: number },
  ): Promise<string>;
  webTextFirstAvailable?(
    selectors: readonly [By, string][],
    options?: {
      fallbackToTextContent?: boolean;
      parent?: WebLocator | null;
      timeout?: number;
    },
  ): Promise<[string, number]>;
  webTextFirstAvailableOnce?(
    selectors: readonly WebSelector[],
    options?: {
      fallbackToTextContent?: boolean;
      parent?: WebLocator | null;
      key?: TimeoutKey;
      timeout?: number;
    },
  ): Promise<[string, number]>;
}

export interface LoginDiagnosticsContext {
  basePrefix: string;
  error?: unknown;
  reason?: LoginDetectionReason;
}

export const DEFAULT_MANUAL_ACTION_TIMEOUT = 300;

export interface VerificationPromptContext {
  kind: "sms" | "email";
  message: string;
}

export enum LoginDetectionReason {
  USER_INFO_MATCH = "USER_INFO_MATCH",
  CTA_MATCH = "CTA_MATCH",
  SELECTOR_TIMEOUT = "SELECTOR_TIMEOUT",
}

export interface LoginOptions {
  captchaDetectionTimeout?: number;
  captureDiagnostics?: (
    context: LoginDiagnosticsContext,
  ) => Promise<void> | void;
  emailVerificationTimeout?: number;
  loginDetectionTimeout?: number;
  // seconds to wait for the user in the browser when no terminal is attached
  manualActionTimeout?: number;
  onManualCaptcha?: () => Promise<void> | void;
  onVerificationPrompt?: (
    context: VerificationPromptContext,
  ) => Promise<void> | void;
  pageLoadTimeout?: number;
  pollIntervalMs?: number;
  quickDomTimeout?: number;
  rootUrl?: string;
  smsVerificationTimeout?: number;
}

export type ResolvedLoginOptions = Required<
  Pick<
    LoginOptions,
    | "captchaDetectionTimeout"
    | "emailVerificationTimeout"
    | "loginDetectionTimeout"
    | "manualActionTimeout"
    | "pageLoadTimeout"
    | "pollIntervalMs"
    | "quickDomTimeout"
    | "rootUrl"
    | "smsVerificationTimeout"
  >
> & LoginOptions;

export function resolveLoginOptions(
  options: LoginOptions,
): ResolvedLoginOptions {
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

export function isTimeoutLike(error: unknown): boolean {
  return error instanceof TimeoutError || hasErrorName(error, "TimeoutError");
}
