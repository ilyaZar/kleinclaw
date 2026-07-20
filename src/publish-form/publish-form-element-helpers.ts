/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { TimeoutError, type WebElement } from "../web-primitives.js";

interface AttributeLike {
  get?(name: string, fallback?: unknown): unknown;
}

export interface SpecialAttributeElementInfo {
  id: string | null;
  localName: string;
  name: string | null;
  role: string;
  type: string;
  checked: unknown;
}

export function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return "concat(" + value.split("'").map((part) => `'${part}'`).join(', "\'", ') + ")";
}

export async function visibleElementText(element: WebElement): Promise<string> {
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

export async function elementInputValue(element: WebElement): Promise<string> {
  if (element.inputValue) {
    return (await element.inputValue()).trim();
  }
  const direct = (element as { value?: unknown }).value;
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

export async function elementAttribute(
  element: WebElement,
  name: string,
): Promise<unknown> {
  const attrs = (element as { attrs?: Record<string, unknown> | AttributeLike }).attrs;
  if (attrs && typeof attrs.get === "function") {
    const value = attrs.get(name, null);
    if (value !== undefined && value !== null) {
      return value;
    }
  } else if (attrs && Object.hasOwn(attrs, name)) {
    return (attrs as Record<string, unknown>)[name];
  }
  return element.getAttribute ? element.getAttribute(name) : null;
}

export async function elementHasAttribute(
  element: WebElement,
  name: string,
): Promise<boolean> {
  const value = await elementAttribute(element, name);
  return value !== null && value !== undefined;
}

export async function elementLocalName(element: WebElement): Promise<string> {
  const direct = (element as { localName?: unknown; local_name?: unknown }).localName ??
    (element as { localName?: unknown; local_name?: unknown }).local_name;
  if (typeof direct === "string") {
    return direct.toLowerCase();
  }
  if (element.evaluate) {
    const value = await element.evaluate("(elem) => elem.localName || elem.tagName || ''");
    return String(value ?? "").toLowerCase();
  }
  return "";
}

export function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const stringValue = String(value);
  return stringValue || null;
}

export async function inspectSpecialAttributeElement(
  element: WebElement,
): Promise<SpecialAttributeElementInfo> {
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

export async function clickElement(
  element: WebElement,
  errorMessage: string,
): Promise<void> {
  if (!element.click) {
    throw new TimeoutError(errorMessage);
  }
  await element.click();
}
