/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
function hasAttributeGetter(value) {
    return typeof value === "object" &&
        value !== null &&
        "attrs" in value &&
        typeof value.attrs?.get === "function";
}
function hasAttributeRecord(value) {
    return typeof value === "object" &&
        value !== null &&
        "attrs" in value &&
        typeof value.attrs === "object" &&
        value.attrs !== null;
}
export async function elementAttribute(element, name) {
    if (element.getAttribute) {
        const value = await element.getAttribute(name);
        if (value !== null && value !== undefined) {
            return value;
        }
    }
    if (hasAttributeGetter(element)) {
        const value = element.attrs.get(name, null);
        return value === null || value === undefined ? null : String(value);
    }
    if (hasAttributeRecord(element)) {
        const value = element.attrs[name];
        return value === null || value === undefined ? null : String(value);
    }
    return null;
}
export async function csrfTokenFromElement(element) {
    const content = await elementAttribute(element, "content");
    if (content) {
        return content;
    }
    throw new Error("Expected CSRF Token not found in HTML content!");
}
