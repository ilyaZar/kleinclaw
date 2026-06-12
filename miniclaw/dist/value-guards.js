/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function errorName(error) {
    return error instanceof Error ? error.name : undefined;
}
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function hasErrorName(error, name) {
    return errorName(error) === name;
}
