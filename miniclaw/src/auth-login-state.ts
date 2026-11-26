/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type LoginConfig } from "./model/browser-login-config.js";
import {
  isTimeoutLike,
  type LoginController,
  type LoginDiagnosticsContext,
  LoginDetectionReason,
  type LoginOptions,
  resolveLoginOptions,
} from "./auth-types.js";
import { By, TimeoutError } from "./web-primitives.js";

export const LOGIN_DETECTION_SELECTORS: readonly [By, string][] = [
  [By.CLASS_NAME, "mr-medium"],
  [By.ID, "user-email"],
];

export const LOGGED_OUT_CTA_SELECTORS: readonly [By, string][] = [
  [By.CSS_SELECTOR, 'a[href*="einloggen"]'],
  [By.CSS_SELECTOR, 'a[href*="/m-einloggen"]'],
];

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

interface TextMatch {
  index: number;
  text: string;
}

// A re-rendering page can drop the node between lookup and read.
export function isStaleNodeError(error: unknown): boolean {
  return error instanceof Error &&
    error.message.trim().toLowerCase().includes("could not find node with given id");
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

export async function captureLoginDiagnostics(
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

async function textFirstAvailable(
  controller: LoginController,
  selectors: readonly [By, string][],
  timeout: number,
  key: "quickDom" | "loginDetection",
  fallbackToTextContent = false,
): Promise<TextMatch> {
  if (controller.webTextFirstAvailableOnce) {
    const [text, index] = await controller.webTextFirstAvailableOnce(selectors, {
      fallbackToTextContent,
      key,
      timeout,
    });
    return { index, text };
  }

  if (controller.webTextFirstAvailable) {
    const [text, index] = await controller.webTextFirstAvailable(selectors, {
      fallbackToTextContent,
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

export async function hasLoggedInMarker(
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
      "quickDom",
      true,
    );
    if (quickMatch.text.toLowerCase().includes(username)) {
      return true;
    }
  } catch (error) {
    if (!isTimeoutLike(error) && !isStaleNodeError(error)) {
      throw error;
    }
  }

  try {
    const match = await textFirstAvailable(
      controller,
      LOGIN_DETECTION_SELECTORS,
      loginDetectionTimeout,
      "loginDetection",
      true,
    );
    return match.text.toLowerCase().includes(username);
  } catch (error) {
    if (isTimeoutLike(error) || isStaleNodeError(error)) {
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
      "quickDom",
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
  const resolvedOptions = resolveLoginOptions(options);
  if (await hasLoggedInMarker(controller, credentials, resolvedOptions)) {
    return new LoginDetectionResult(
      true,
      LoginDetectionReason.USER_INFO_MATCH,
    );
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
  return new LoginDetectionResult(
    false,
    LoginDetectionReason.SELECTOR_TIMEOUT,
  );
}
