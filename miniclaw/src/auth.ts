/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import assert from "node:assert";

import { fillLoginDataAndSend } from "./auth-auth0-flow.js";
import {
  captureLoginDiagnostics,
  currentPageUrl,
  getLoginState,
  type LoginDetectionResult,
} from "./auth-login-state.js";
import {
  clickGdprBanner,
  handleAfterLoginLogic,
  ManualActionRequiredError,
} from "./auth-manual-verification.js";
import {
  assertIpRangeAvailable,
  IP_RANGE_BLOCK_MESSAGE,
  IpRangeBlockedError,
} from "./auth-network-gate.js";
import {
  isTimeoutLike,
  type LoginController,
  type LoginDiagnosticsContext,
  LoginDetectionReason,
  type LoginOptions,
  resolveLoginOptions,
  type VerificationPromptContext,
} from "./auth-types.js";
import { type LoginConfig } from "./model/browser-login-config.js";

export {
  fillLoginDataAndSend,
  getLoginState,
  IP_RANGE_BLOCK_MESSAGE,
  IpRangeBlockedError,
  LoginDetectionReason,
  ManualActionRequiredError,
};
export {
  type LoginController,
  type LoginDetectionResult,
  type LoginDiagnosticsContext,
  type LoginOptions,
  type VerificationPromptContext,
};

function requireLoginCredentials(credentials: LoginConfig): void {
  if (!credentials.username.trim() || !credentials.password) {
    throw new Error(
      "login.username and login.password must be configured before browser login",
    );
  }
}

export async function login(
  controller: LoginController,
  credentials: LoginConfig,
  options: LoginOptions = {},
): Promise<LoginDetectionResult> {
  requireLoginCredentials(credentials);
  const resolvedOptions = resolveLoginOptions(options);

  await controller.webOpen(resolvedOptions.rootUrl);
  await assertIpRangeAvailable(controller);
  await clickGdprBanner(controller, resolvedOptions.quickDomTimeout);

  let detectionResult = await getLoginState(controller, credentials, {
    ...resolvedOptions,
    captureSelectorDiagnostics: false,
  });
  if (detectionResult.isLoggedIn) {
    return detectionResult;
  }

  try {
    await controller.webOpen(
      `${resolvedOptions.rootUrl}/m-einloggen-sso.html`,
      { timeout: resolvedOptions.pageLoadTimeout },
    );
    await assertIpRangeAvailable(controller);
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

  await clickGdprBanner(controller, resolvedOptions.quickDomTimeout);
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
