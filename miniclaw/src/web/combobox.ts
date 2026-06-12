/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

export function normalizeComboboxSearchValue(value: string | number): string {
  return String(value).replaceAll("_", " ").split(/\s+/).filter(Boolean).join(" ");
}

export function normalizeComboboxComparisonValue(value: unknown): string {
  return String(value ?? "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
