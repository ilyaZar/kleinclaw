/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export function requirePageMethod(method, name) {
    if (!method) {
        throw new Error(`Page does not support ${name}`);
    }
    return method;
}
export function validCodes(validResponseCodes) {
    return new Set(typeof validResponseCodes === "number"
        ? [validResponseCodes]
        : validResponseCodes);
}
export function ensureStatusCode(response) {
    if (typeof response !== "object" ||
        response === null ||
        !("statusCode" in response)) {
        throw new Error("web_request returned an invalid response object");
    }
}
