/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import assert from "node:assert";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { type LoginConfig } from "./model/config-model.js";
import { checkAndWaitForCaptcha } from "./publish-form.js";
import { hasErrorName } from "./value-guards.js";
import {
  By,
  TimeoutError,
  type WebLocator,
} from "./web-primitives.js";

export const LOGIN_DETECTION_SELECTORS: readonly [By, string][] = [
  [By.CLASS_NAME, "mr-medium"],
  [By.ID, "user-email"],
];

export const LOGGED_OUT_CTA_SELECTORS: readonly [By, string][] = [
  [By.CSS_SELECTOR, 'a[href*="einloggen"]'],
  [By.CSS_SELECTOR, 'a[href*="/m-einloggen"]'],
];

export enum LoginDetectionReason {
  USER_INFO_MATCH = "USER_INFO_MATCH",
  CTA_MATCH = "CTA_MATCH",
  SELECTOR_TIMEOUT = "SELECTOR_TIMEOUT",
}

export class LoginDetectionResult {
  readonly isLoggedIn: boolean;
  readonly reason: LoginDetectionReason;

  constructor(isLoggedIn: boolean, reason: LoginDetectionReason) {
    if (isLoggedIn && reason !== LoginDetectionReason.USER_INFO_MATCH) {
      throw new Error("isLoggedIn=true requires reason=USER_INFO_MATCH");
    }
    if (!isLoggedIn && reason === LoginDetectionReason.USER_INFO_MATCH) {
      throw new Error(
        "isLoggedIn=false requires reason=CTA_MATCH or SELECTOR_TIMEOUT",
      );
    }
    this.isLoggedIn = isLoggedIn;
    this.reason = reason;
  }
}

export interface LoginController {
  readonly page?: { url?: string };
  webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
  webInput(type: By, value: string, text: string, timeout?: number): Promise<WebLocator>;
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
    options?: { parent?: WebLocator | null; timeout?: number },
  ): Promise<[string, number]>;
}

export interface LoginDiagnosticsContext {
  basePrefix: string;
  error?: unknown;
  reason?: LoginDetectionReason;
}

export interface VerificationPromptContext {
  kind: "sms" | "email";
  message: string;
}

export interface LoginOptions {
  captchaDetectionTimeout?: number;
  captureDiagnostics?: (
    context: LoginDiagnosticsContext,
  ) => Promise<void> | void;
  emailVerificationTimeout?: number;
  loginDetectionTimeout?: number;
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

interface TextMatch {
  index: number;
  text: string;
}

function isTimeoutLike(error: unknown): boolean {
  return error instanceof TimeoutError ||
    hasErrorName(error, "TimeoutError");
}

function loginOptionsWithDefaults(options: LoginOptions): Required<
  Pick<
    LoginOptions,
    | "captchaDetectionTimeout"
    | "emailVerificationTimeout"
    | "loginDetectionTimeout"
    | "pageLoadTimeout"
    | "pollIntervalMs"
    | "quickDomTimeout"
    | "rootUrl"
    | "smsVerificationTimeout"
  >
> & LoginOptions {
  return {
    captchaDetectionTimeout: options.captchaDetectionTimeout ?? 2,
    captureDiagnostics: options.captureDiagnostics,
    emailVerificationTimeout: options.emailVerificationTimeout ?? 5,
    loginDetectionTimeout: options.loginDetectionTimeout ?? 12,
    onManualCaptcha: options.onManualCaptcha,
    onVerificationPrompt: options.onVerificationPrompt,
    pageLoadTimeout: options.pageLoadTimeout ?? 15,
    pollIntervalMs: options.pollIntervalMs ?? 250,
    quickDomTimeout: options.quickDomTimeout ?? 2,
    rootUrl: options.rootUrl ?? "https://www.kleinanzeigen.de",
    smsVerificationTimeout: options.smsVerificationTimeout ?? 5,
  };
}

function requireLoginCredentials(credentials: LoginConfig): void {
  if (!credentials.username.trim() || !credentials.password) {
    throw new Error(
      "login.username and login.password must be configured before browser login",
    );
  }
}

export function currentPageUrl(controller: LoginController): string {
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
  } catch {
    return "unknown";
  }
}

export function isValidPostAuth0Destination(url: string): boolean {
  if (!url || url === "unknown" || url === "about:blank") {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
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

async function captureLoginDiagnostics(
  options: LoginOptions,
  context: LoginDiagnosticsContext,
): Promise<void> {
  if (!options.captureDiagnostics) {
    return;
  }
  try {
    await options.captureDiagnostics(context);
  } catch {
    // Diagnostics must not hide the original login boundary failure.
  }
}

async function waitForCondition(
  controller: LoginController,
  condition: () => boolean | Promise<boolean>,
  {
    pollIntervalMs,
    timeout,
    timeoutErrorMessage,
  }: {
    pollIntervalMs: number;
    timeout: number;
    timeoutErrorMessage: string;
  },
): Promise<void> {
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

async function textFirstAvailable(
  controller: LoginController,
  selectors: readonly [By, string][],
  timeout: number,
): Promise<TextMatch> {
  if (controller.webTextFirstAvailable) {
    const [text, index] = await controller.webTextFirstAvailable(selectors, {
      timeout,
    });
    return { index, text };
  }

  let lastError: unknown = null;
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
    } catch (error) {
      if (!isTimeoutLike(error)) {
        throw error;
      }
      lastError = error;
    }
  }
  throw new TimeoutError(
    `No login selector matched within ${timeout} seconds: ${String(lastError)}`,
  );
}

async function hasLoggedInMarker(
  controller: LoginController,
  credentials: LoginConfig,
  options: LoginOptions,
): Promise<boolean> {
  const username = credentials.username.trim().toLowerCase();
  if (!username) {
    return false;
  }
  const {
    loginDetectionTimeout = 12,
    quickDomTimeout = 2,
  } = options;

  try {
    const quickMatch = await textFirstAvailable(
      controller,
      LOGIN_DETECTION_SELECTORS,
      quickDomTimeout,
    );
    if (quickMatch.text.toLowerCase().includes(username)) {
      return true;
    }
  } catch (error) {
    if (!isTimeoutLike(error)) {
      throw error;
    }
  }

  try {
    const match = await textFirstAvailable(
      controller,
      LOGIN_DETECTION_SELECTORS,
      loginDetectionTimeout,
    );
    return match.text.toLowerCase().includes(username);
  } catch (error) {
    if (isTimeoutLike(error)) {
      return false;
    }
    throw error;
  }
}

async function hasLoggedOutCta(
  controller: LoginController,
  options: LoginOptions,
): Promise<boolean> {
  const { quickDomTimeout = 2 } = options;
  try {
    const match = await textFirstAvailable(
      controller,
      LOGGED_OUT_CTA_SELECTORS,
      quickDomTimeout,
    );
    return match.text.trim().length > 0;
  } catch (error) {
    if (isTimeoutLike(error)) {
      return false;
    }
    throw error;
  }
}

export async function getLoginState(
  controller: LoginController,
  credentials: LoginConfig,
  {
    captureSelectorDiagnostics = true,
    ...options
  }: LoginOptions & { captureSelectorDiagnostics?: boolean } = {},
): Promise<LoginDetectionResult> {
  const resolvedOptions = loginOptionsWithDefaults(options);
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

export async function isLoggedIn(
  controller: LoginController,
  credentials: LoginConfig,
  options: LoginOptions = {},
): Promise<boolean> {
  return hasLoggedInMarker(
    controller,
    credentials,
    loginOptionsWithDefaults(options),
  );
}

async function promptForManualAction(message: string): Promise<void> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error(`${message} Manual browser action requires an interactive run.`);
  }

  console.error("############################################");
  console.error(message);
  console.error("############################################");
  const readline = createInterface({ input, output });
  try {
    await readline.question("Press ENTER when done...");
  } finally {
    readline.close();
  }
}

async function defaultManualCaptchaPrompt(): Promise<void> {
  await promptForManualAction("# Captcha present! Please solve the captcha.");
}

async function defaultVerificationPrompt(
  context: VerificationPromptContext,
): Promise<void> {
  await promptForManualAction(
    `# Device verification message detected (${context.kind}). ` +
      "Please follow the instruction displayed in the browser.",
  );
}

export async function waitForAuth0LoginContext(
  controller: LoginController,
  options: LoginOptions = {},
): Promise<void> {
  const resolvedOptions = loginOptionsWithDefaults(options);
  try {
    await waitForCondition(
      controller,
      () => currentPageUrl(controller).includes("login.kleinanzeigen.de") ||
        currentPageUrl(controller).includes("/u/login"),
      {
        pollIntervalMs: resolvedOptions.pollIntervalMs,
        timeout: resolvedOptions.loginDetectionTimeout,
        timeoutErrorMessage:
          `Auth0 redirect did not start within ${resolvedOptions.loginDetectionTimeout} seconds`,
      },
    );
  } catch (error) {
    if (isTimeoutLike(error)) {
      throw new assert.AssertionError({
        message: `Auth0 redirect not detected (url=${currentPageUrl(controller)})`,
      });
    }
    throw error;
  }
}

export async function waitForAuth0PasswordStep(
  controller: LoginController,
  options: LoginOptions = {},
): Promise<void> {
  const resolvedOptions = loginOptionsWithDefaults(options);
  try {
    await waitForCondition(
      controller,
      () => currentPageUrl(controller).includes("/u/login/password"),
      {
        pollIntervalMs: resolvedOptions.pollIntervalMs,
        timeout: resolvedOptions.loginDetectionTimeout,
        timeoutErrorMessage:
          `Auth0 password page not reached within ${resolvedOptions.loginDetectionTimeout} seconds`,
      },
    );
  } catch (error) {
    if (isTimeoutLike(error)) {
      throw new assert.AssertionError({
        message: `Auth0 password step not reached (url=${currentPageUrl(controller)})`,
      });
    }
    throw error;
  }
}

export async function waitForPostAuth0SubmitTransition(
  controller: LoginController,
  credentials: LoginConfig,
  options: LoginOptions = {},
): Promise<void> {
  const resolvedOptions = loginOptionsWithDefaults(options);
  try {
    await waitForCondition(
      controller,
      () => isValidPostAuth0Destination(currentPageUrl(controller)),
      {
        pollIntervalMs: resolvedOptions.pollIntervalMs,
        timeout: resolvedOptions.loginDetectionTimeout,
        timeoutErrorMessage:
          `Auth0 post-submit transition did not complete within ${resolvedOptions.loginDetectionTimeout} seconds`,
      },
    );
    return;
  } catch (error) {
    if (!isTimeoutLike(error)) {
      throw error;
    }
  }

  if (await isLoggedIn(controller, credentials, resolvedOptions)) {
    return;
  }

  const fallbackMaxMs = Math.max(700, Math.trunc(resolvedOptions.quickDomTimeout * 1000));
  const fallbackMinMs = Math.max(300, Math.trunc(fallbackMaxMs / 2));
  await controller.webSleep(fallbackMinMs, fallbackMaxMs);

  if (await hasLoggedInMarker(controller, credentials, {
    ...resolvedOptions,
    loginDetectionTimeout: resolvedOptions.quickDomTimeout,
  })) {
    return;
  }

  throw new TimeoutError(
    `Auth0 post-submit verification remained inconclusive (url=${currentPageUrl(controller)})`,
  );
}

export async function fillLoginDataAndSend(
  controller: LoginController,
  credentials: LoginConfig,
  options: LoginOptions = {},
): Promise<void> {
  const resolvedOptions = loginOptionsWithDefaults(options);
  await waitForAuth0LoginContext(controller, resolvedOptions);
  await controller.webInput(By.ID, "username", credentials.username);
  await controller.webClick(By.CSS_SELECTOR, "button[type='submit']");

  await waitForAuth0PasswordStep(controller, resolvedOptions);
  await controller.webInput(
    By.CSS_SELECTOR,
    "input[type='password']",
    credentials.password,
  );
  await checkAndWaitForCaptcha(controller, {
    captchaDetectionTimeout: resolvedOptions.captchaDetectionTimeout,
    isLoginPage: true,
    onManualCaptcha: async () => {
      await (resolvedOptions.onManualCaptcha ?? defaultManualCaptchaPrompt)();
    },
  });
  await controller.webClick(By.CSS_SELECTOR, "button[type='submit']");
  await waitForPostAuth0SubmitTransition(
    controller,
    credentials,
    resolvedOptions,
  );
}

export async function clickGdprBanner(
  controller: LoginController,
  timeout: number,
): Promise<void> {
  const element = await controller.webProbe(By.ID, "gdpr-banner-accept", {
    timeout,
  });
  if (element) {
    await element.click?.();
    await controller.webSleep();
  }
}

export async function dismissConsentBanner(
  controller: LoginController,
  options: LoginOptions = {},
): Promise<void> {
  const resolvedOptions = loginOptionsWithDefaults(options);
  await clickGdprBanner(controller, resolvedOptions.quickDomTimeout);
}

async function checkVerificationPrompt(
  controller: LoginController,
  {
    kind,
    message,
    onVerificationPrompt,
    timeout,
  }: {
    kind: VerificationPromptContext["kind"];
    message: string;
    onVerificationPrompt?: LoginOptions["onVerificationPrompt"];
    timeout: number;
  },
): Promise<void> {
  const element = await controller.webProbe(By.TEXT, message, { timeout });
  if (!element) {
    return;
  }
  await (onVerificationPrompt ?? defaultVerificationPrompt)({ kind, message });
}

export async function handleAfterLoginLogic(
  controller: LoginController,
  options: LoginOptions = {},
): Promise<void> {
  const resolvedOptions = loginOptionsWithDefaults(options);
  await checkVerificationPrompt(controller, {
    kind: "sms",
    message: "Wir haben dir gerade einen 6-stelligen Code für die Telefonnummer",
    onVerificationPrompt: resolvedOptions.onVerificationPrompt,
    timeout: resolvedOptions.smsVerificationTimeout,
  });
  await checkVerificationPrompt(controller, {
    kind: "email",
    message: "Um dein Konto zu schützen haben wir dir eine E-Mail geschickt",
    onVerificationPrompt: resolvedOptions.onVerificationPrompt,
    timeout: resolvedOptions.emailVerificationTimeout,
  });
  await clickGdprBanner(controller, resolvedOptions.quickDomTimeout);
}

export async function login(
  controller: LoginController,
  credentials: LoginConfig,
  options: LoginOptions = {},
): Promise<LoginDetectionResult> {
  requireLoginCredentials(credentials);
  const resolvedOptions = loginOptionsWithDefaults(options);

  await controller.webOpen(resolvedOptions.rootUrl);
  await clickGdprBanner(controller, resolvedOptions.quickDomTimeout);

  let detectionResult = await getLoginState(controller, credentials, {
    ...resolvedOptions,
    captureSelectorDiagnostics: false,
  });
  if (detectionResult.isLoggedIn) {
    return detectionResult;
  }

  try {
    await controller.webOpen(`${resolvedOptions.rootUrl}/m-einloggen-sso.html`, {
      timeout: resolvedOptions.pageLoadTimeout,
    });
  } catch (error) {
    if (isTimeoutLike(error)) {
      await captureLoginDiagnostics(resolvedOptions, {
        basePrefix: "login_detection_sso_navigation_timeout",
        error,
      });
    }
    throw error;
  }

  try {
    await fillLoginDataAndSend(controller, credentials, resolvedOptions);
    await handleAfterLoginLogic(controller, resolvedOptions);
  } catch (error) {
    if (error instanceof assert.AssertionError || isTimeoutLike(error)) {
      await captureLoginDiagnostics(resolvedOptions, {
        basePrefix: "login_detection_auth0_flow_failure",
        error,
      });
    }
    throw error;
  }

  await dismissConsentBanner(controller, resolvedOptions);
  detectionResult = await getLoginState(controller, credentials, {
    ...resolvedOptions,
    captureSelectorDiagnostics: false,
  });
  if (detectionResult.isLoggedIn) {
    return detectionResult;
  }

  await captureLoginDiagnostics(resolvedOptions, {
    basePrefix: `login_detection_${detectionResult.reason.toLowerCase()}`,
    reason: detectionResult.reason,
  });
  throw new assert.AssertionError({
    message:
      "Login could not be confirmed after Auth0 flow " +
      `(reason=${detectionResult.reason}, url=${currentPageUrl(controller)})`,
  });
}
