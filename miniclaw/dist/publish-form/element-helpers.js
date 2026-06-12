/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { TimeoutError } from "../web-primitives.js";
export function xpathLiteral(value) {
    if (!value.includes("'")) {
        return `'${value}'`;
    }
    if (!value.includes('"')) {
        return `"${value}"`;
    }
    return "concat(" + value.split("'").map((part) => `'${part}'`).join(', "\'", ') + ")";
}
export async function visibleElementText(element) {
    if (element.textContent) {
        return (await element.textContent())?.trim() ?? "";
    }
    if (element.evaluate) {
        const value = await element.evaluate(`
      function (elem) {
        let sel = window.getSelection();
        sel.removeAllRanges();
        let range = document.createRange();
        range.selectNode(elem);
        sel.addRange(range);
        let visibleText = sel.toString().trim();
        sel.removeAllRanges();
        return visibleText;
      }
    `);
        return String(value ?? "");
    }
    return "";
}
export async function elementInputValue(element) {
    if (element.inputValue) {
        return (await element.inputValue()).trim();
    }
    const direct = element.value;
    if (direct !== undefined && direct !== null) {
        return String(direct).trim();
    }
    const attributeValue = await elementAttribute(element, "value");
    if (attributeValue !== null && attributeValue !== undefined) {
        return String(attributeValue).trim();
    }
    if (element.evaluate) {
        const value = await element.evaluate(`
      function (elem) {
        return String(elem.value || '').trim();
      }
    `);
        return String(value ?? "");
    }
    return "";
}
export async function elementAttribute(element, name) {
    const attrs = element.attrs;
    if (attrs && typeof attrs.get === "function") {
        const value = attrs.get(name, null);
        if (value !== undefined && value !== null) {
            return value;
        }
    }
    else if (attrs && Object.hasOwn(attrs, name)) {
        return attrs[name];
    }
    return element.getAttribute ? element.getAttribute(name) : null;
}
export async function elementHasAttribute(element, name) {
    const value = await elementAttribute(element, name);
    return value !== null && value !== undefined;
}
export async function elementLocalName(element) {
    const direct = element.localName ??
        element.local_name;
    if (typeof direct === "string") {
        return direct.toLowerCase();
    }
    if (element.evaluate) {
        const value = await element.evaluate("(elem) => elem.localName || elem.tagName || ''");
        return String(value ?? "").toLowerCase();
    }
    return "";
}
export function stringOrNull(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const stringValue = String(value);
    return stringValue || null;
}
export async function inspectSpecialAttributeElement(element) {
    const [id, name, type, role, checked, localName] = await Promise.all([
        elementAttribute(element, "id"),
        elementAttribute(element, "name"),
        elementAttribute(element, "type"),
        elementAttribute(element, "role"),
        elementAttribute(element, "checked"),
        elementLocalName(element),
    ]);
    return {
        id: stringOrNull(id),
        localName,
        name: stringOrNull(name),
        role: String(role ?? "").toLowerCase(),
        type: String(type ?? "").toLowerCase(),
        checked,
    };
}
export async function clickElement(element, errorMessage) {
    if (!element.click) {
        throw new TimeoutError(errorMessage);
    }
    await element.click();
}
