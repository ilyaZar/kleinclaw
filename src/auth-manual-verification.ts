/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import {
  type LoginController,
  type LoginOptions,
  resolveLoginOptions,
  type VerificationPromptContext,
} from "./auth-types.js";
import { By } from "./web-primitives.js";

export class ManualActionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualActionRequiredError";
  }
}

async function promptForManualAction(message: string): Promise<void> {
  if (!input.isTTY || !output.isTTY) {
    throw new ManualActionRequiredError(
      `${message} Manual browser action requires an interactive run.`,
    );
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

export async function defaultManualCaptchaPrompt(): Promise<void> {
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
  const resolvedOptions = resolveLoginOptions(options);
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
