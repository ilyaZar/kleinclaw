/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export function idsMatch(left, right) {
    if (left === null || left === undefined || left === "") {
        return false;
    }
    if (right === null || right === undefined || right === "") {
        return false;
    }
    return String(left) === String(right);
}
export function publishedAdId(value) {
    if (typeof value === "number" && Number.isInteger(value)) {
        return Number.isSafeInteger(value) ? value : null;
    }
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) {
        return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
}
export function extractAdIdFromAdUrl(url) {
    try {
        const pathWithoutQuery = url.split("?", 1)[0] ?? "";
        const lastSegment = pathWithoutQuery.replace(/\/+$/, "").split("/").at(-1) ?? "";
        const idPart = lastSegment.split("-", 1)[0] ?? "";
        if (!/^[+-]?\d+$/.test(idPart)) {
            return -1;
        }
        const adId = Number.parseInt(idPart, 10);
        return Number.isSafeInteger(adId) ? adId : -1;
    }
    catch {
        return -1;
    }
}
