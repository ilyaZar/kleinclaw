/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { hasErrorName } from "../value-guards.js";
export class TimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = "TimeoutError";
    }
}
export function isTimeoutLike(error) {
    return error instanceof TimeoutError ||
        hasErrorName(error, "TimeoutError");
}
