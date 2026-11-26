/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

export class CategoryResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryResolutionError";
  }
}

export class CaptchaEncountered extends Error {
  constructor(readonly restartDelaySeconds: number | null = null) {
    super("Captcha encountered");
    this.name = "CaptchaEncountered";
  }
}

export class PublishSubmissionUncertainError extends Error {
  constructor(message: string = "submission may have succeeded before failure") {
    super(message);
    this.name = "PublishSubmissionUncertainError";
  }
}

// The form rejected the submitted values; retrying the same values cannot help.
export class AdFormValidationError extends Error {
  constructor(errors: readonly string[]) {
    super(`Ad form validation failed: ${errors.join("; ")}`);
    this.name = "AdFormValidationError";
  }
}
