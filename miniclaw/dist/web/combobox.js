/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export function normalizeComboboxSearchValue(value) {
    return String(value).replaceAll("_", " ").split(/\s+/).filter(Boolean).join(" ");
}
export function normalizeComboboxComparisonValue(value) {
    return String(value ?? "")
        .replace(/_+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
