/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export class CategoryResolutionError extends Error {
    constructor(message) {
        super(message);
        this.name = "CategoryResolutionError";
    }
}
export class CaptchaEncountered extends Error {
    restartDelaySeconds;
    constructor(restartDelaySeconds = null) {
        super("Captcha encountered");
        this.restartDelaySeconds = restartDelaySeconds;
        this.name = "CaptchaEncountered";
    }
}
export class PublishSubmissionUncertainError extends Error {
    constructor(message = "submission may have succeeded before failure") {
        super(message);
        this.name = "PublishSubmissionUncertainError";
    }
}
