/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export async function elementAttribute(element, name) {
    if (element.getAttribute) {
        return element.getAttribute(name);
    }
    const attrs = element.attrs;
    if (!attrs) {
        return null;
    }
    const value = attrs[name];
    return value === null || value === undefined ? null : String(value);
}
