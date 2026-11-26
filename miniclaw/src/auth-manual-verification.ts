/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import {
  DEFAULT_MANUAL_ACTION_TIMEOUT,
  type LoginController,
  type LoginOptions,
  type ResolvedLoginOptions,
  resolveLoginOptions,
  type VerificationPromptContext,
} from "./auth-types.js";
import { CAPTCHA_IFRAME_SELECTOR } from "./publish-form/publish-form-constants.js";
import { By } from "./web-primitives.js";

const CAPTCHA_TOKEN_PRESENT_JS =
  "Boolean(document.querySelector(\"input[name='captcha']\")?.value || " +
  "document.querySelector(\"textarea[name='g-recaptcha-response']\")?.value)";

export class ManualActionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualActionRequiredError";
  }
}

async function promptForManualAction(message: string): Promise<void> {
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

const MANUAL_ACTION_POLL_MS = 2000;

// Hand a step to the user. With a terminal, wait for ENTER; without one (e.g.
// under KleinClaw), poll the page until `resolved` holds, so the user can
// finish the step in the browser window at their own pace.
export async function waitForManualAction(
  controller: Pick<LoginController, "webSleep">,
  message: string,
  resolved: () => Promise<boolean>,
  {
    interactive = Boolean(input.isTTY && output.isTTY),
    timeoutSeconds = DEFAULT_MANUAL_ACTION_TIMEOUT,
  }: { interactive?: boolean; timeoutSeconds?: number } = {},
): Promise<void> {
  if (interactive) {
    await promptForManualAction(message);
    return;
  }
  if (timeoutSeconds <= 0) {
    throw new ManualActionRequiredError(
      `${message} Manual browser action requires an interactive run.`,
    );
  }
  console.error(
    `${message} Waiting up to ${timeoutSeconds} s for it to be done in the browser window.`,
  );
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (await resolved()) {
      return;
    }
    await controller.webSleep(MANUAL_ACTION_POLL_MS, MANUAL_ACTION_POLL_MS);
  }
  if (await resolved()) {
    return;
  }
  throw new ManualActionRequiredError(
    `${message} It was not done within ${timeoutSeconds} s.`,
  );
}

export const CAPTCHA_PROMPT = "# Captcha present! Please solve the captcha.";

// A solved captcha leaves a token, or the captcha disappears.
export async function captchaResolved(controller: LoginController): Promise<boolean> {
  try {
    if (await controller.webExecute(CAPTCHA_TOKEN_PRESENT_JS) === true) {
      return true;
    }
  } catch {
    // keep polling
  }
  return await controller.webProbe(By.CSS_SELECTOR, CAPTCHA_IFRAME_SELECTOR, {
    timeout: 0,
  }) === null;
}

export async function waitForManualCaptcha(
  controller: LoginController,
  options: ResolvedLoginOptions,
  resolved: () => Promise<boolean> = () => captchaResolved(controller),
): Promise<void> {
  if (options.onManualCaptcha) {
    await options.onManualCaptcha();
    return;
  }
  await waitForManualAction(controller, CAPTCHA_PROMPT, resolved, {
    timeoutSeconds: options.manualActionTimeout,
  });
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

// Both the request-code screen ("Wir senden dir ... Code") and the
// code-sent screen ("Wir haben dir gerade ... Telefonnummer") need the user.
// The user requests and types the code in the browser; miniclaw never does.
export const SMS_VERIFICATION_XPATH =
  "//*[not(self::script or self::style)]" +
  "[(text()[contains(., 'Wir haben dir gerade')] and contains(., 'Telefonnummer')) " +
  "or (text()[contains(., 'Wir senden dir')] and contains(., 'Code'))]";
const EMAIL_VERIFICATION_TEXT =
  "Um dein Konto zu schützen haben wir dir eine E-Mail geschickt";

async function checkVerificationPrompt(
  controller: LoginController,
  options: ResolvedLoginOptions,
  {
    kind,
    selector,
    timeout,
  }: {
    kind: VerificationPromptContext["kind"];
    selector: [By, string];
    timeout: number;
  },
): Promise<void> {
  const [type, value] = selector;
  if (!await controller.webProbe(type, value, { timeout })) {
    return;
  }
  const message = `# Device verification message detected (${kind}). ` +
    "Please follow the instruction displayed in the browser.";
  if (options.onVerificationPrompt) {
    await options.onVerificationPrompt({ kind, message });
    return;
  }
  await waitForManualAction(
    controller,
    message,
    async () => await controller.webProbe(type, value, { timeout: 0 }) === null,
    { timeoutSeconds: options.manualActionTimeout },
  );
}

export async function handleAfterLoginLogic(
  controller: LoginController,
  options: LoginOptions = {},
): Promise<void> {
  const resolvedOptions = resolveLoginOptions(options);
  await checkVerificationPrompt(controller, resolvedOptions, {
    kind: "sms",
    selector: [By.XPATH, SMS_VERIFICATION_XPATH],
    timeout: resolvedOptions.smsVerificationTimeout,
  });
  await checkVerificationPrompt(controller, resolvedOptions, {
    kind: "email",
    selector: [By.TEXT, EMAIL_VERIFICATION_TEXT],
    timeout: resolvedOptions.emailVerificationTimeout,
  });
  await clickGdprBanner(controller, resolvedOptions.quickDomTimeout);
}
