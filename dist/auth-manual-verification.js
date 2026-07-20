/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { resolveLoginOptions, } from "./auth-types.js";
import { By } from "./web-primitives.js";
export class ManualActionRequiredError extends Error {
    constructor(message) {
        super(message);
        this.name = "ManualActionRequiredError";
    }
}
async function promptForManualAction(message) {
    if (!input.isTTY || !output.isTTY) {
        throw new ManualActionRequiredError(`${message} Manual browser action requires an interactive run.`);
    }
    console.error("############################################");
    console.error(message);
    console.error("############################################");
    const readline = createInterface({ input, output });
    try {
        await readline.question("Press ENTER when done...");
    }
    finally {
        readline.close();
    }
}
export async function defaultManualCaptchaPrompt() {
    await promptForManualAction("# Captcha present! Please solve the captcha.");
}
async function defaultVerificationPrompt(context) {
    await promptForManualAction(`# Device verification message detected (${context.kind}). ` +
        "Please follow the instruction displayed in the browser.");
}
export async function clickGdprBanner(controller, timeout) {
    const element = await controller.webProbe(By.ID, "gdpr-banner-accept", {
        timeout,
    });
    if (element) {
        await element.click?.();
        await controller.webSleep();
    }
}
async function checkVerificationPrompt(controller, { kind, message, onVerificationPrompt, timeout, }) {
    const element = await controller.webProbe(By.TEXT, message, { timeout });
    if (!element) {
        return;
    }
    await (onVerificationPrompt ?? defaultVerificationPrompt)({ kind, message });
}
export async function handleAfterLoginLogic(controller, options = {}) {
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
