/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import assert from "node:assert";

import {
  currentPageUrl,
  hasLoggedInMarker,
} from "./auth-login-state.js";
import { defaultManualCaptchaPrompt } from "./auth-manual-verification.js";
import {
  isTimeoutLike,
  type LoginController,
  type LoginOptions,
  type ResolvedLoginOptions,
  resolveLoginOptions,
} from "./auth-types.js";
import { type LoginConfig } from "./model/browser-login-config.js";
import {
  checkAndWaitForCaptcha,
} from "./publish-form/publish-form-submit-flow.js";
import { By, TimeoutError } from "./web-primitives.js";

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

async function waitForAuth0Transition(
  controller: LoginController,
  options: ResolvedLoginOptions,
  {
    assertionMessage,
    condition,
    timeoutMessage,
  }: {
    assertionMessage: string;
    condition: () => boolean;
    timeoutMessage: string;
  },
): Promise<void> {
  try {
    await waitForCondition(controller, condition, {
      pollIntervalMs: options.pollIntervalMs,
      timeout: options.loginDetectionTimeout,
      timeoutErrorMessage: timeoutMessage,
    });
  } catch (error) {
    if (isTimeoutLike(error)) {
      throw new assert.AssertionError({
        message: `${assertionMessage} (url=${currentPageUrl(controller)})`,
      });
    }
    throw error;
  }
}

async function waitForAuth0LoginContext(
  controller: LoginController,
  options: ResolvedLoginOptions,
): Promise<void> {
  await waitForAuth0Transition(controller, options, {
    assertionMessage: "Auth0 redirect not detected",
    condition: () => currentPageUrl(controller)
      .includes("login.kleinanzeigen.de") ||
      currentPageUrl(controller).includes("/u/login"),
    timeoutMessage:
      `Auth0 redirect did not start within ${
        options.loginDetectionTimeout
      } seconds`,
  });
}

async function waitForAuth0PasswordStep(
  controller: LoginController,
  options: ResolvedLoginOptions,
): Promise<void> {
  await waitForAuth0Transition(controller, options, {
    assertionMessage: "Auth0 password step not reached",
    condition: () => currentPageUrl(controller).includes("/u/login/password"),
    timeoutMessage:
      `Auth0 password page not reached within ${
        options.loginDetectionTimeout
      } seconds`,
  });
}

function isValidPostAuth0Destination(url: string): boolean {
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

async function waitForPostAuth0SubmitTransition(
  controller: LoginController,
  credentials: LoginConfig,
  options: ResolvedLoginOptions,
): Promise<void> {
  try {
    await waitForCondition(
      controller,
      () => isValidPostAuth0Destination(currentPageUrl(controller)),
      {
        pollIntervalMs: options.pollIntervalMs,
        timeout: options.loginDetectionTimeout,
        timeoutErrorMessage:
          `Auth0 post-submit transition did not complete within ${
            options.loginDetectionTimeout
          } seconds`,
      },
    );
    return;
  } catch (error) {
    if (!isTimeoutLike(error)) {
      throw error;
    }
  }

  if (await hasLoggedInMarker(controller, credentials, options)) {
    return;
  }

  const fallbackMaxMs = Math.max(
    700,
    Math.trunc(options.quickDomTimeout * 1000),
  );
  const fallbackMinMs = Math.max(300, Math.trunc(fallbackMaxMs / 2));
  await controller.webSleep(fallbackMinMs, fallbackMaxMs);

  if (await hasLoggedInMarker(controller, credentials, {
    ...options,
    loginDetectionTimeout: options.quickDomTimeout,
  })) {
    return;
  }

  throw new TimeoutError(
    "Auth0 post-submit verification remained inconclusive " +
      `(url=${currentPageUrl(controller)})`,
  );
}

export async function fillLoginDataAndSend(
  controller: LoginController,
  credentials: LoginConfig,
  options: LoginOptions = {},
): Promise<void> {
  const resolvedOptions = resolveLoginOptions(options);
  await waitForAuth0LoginContext(controller, resolvedOptions);
  await controller.webInput(By.ID, "username", credentials.username);
  await checkAndWaitForCaptcha(controller, {
    captchaDetectionTimeout: resolvedOptions.captchaDetectionTimeout,
    isLoginPage: true,
    onManualCaptcha: async () => {
      await (resolvedOptions.onManualCaptcha ?? defaultManualCaptchaPrompt)();
    },
  });
  if (!currentPageUrl(controller).includes("/u/login/password")) {
    await controller.webClick(By.CSS_SELECTOR, "button[type='submit']");
  }

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
