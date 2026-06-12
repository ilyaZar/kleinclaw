/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type WebElement } from "../web-primitives.js";

function hasAttributeGetter(
  value: unknown,
): value is { attrs: { get(name: string, fallback?: unknown): unknown } } {
  return typeof value === "object" &&
    value !== null &&
    "attrs" in value &&
    typeof (value as { attrs?: { get?: unknown } }).attrs?.get === "function";
}

function hasAttributeRecord(
  value: unknown,
): value is { attrs: Record<string, unknown> } {
  return typeof value === "object" &&
    value !== null &&
    "attrs" in value &&
    typeof (value as { attrs?: unknown }).attrs === "object" &&
    (value as { attrs?: unknown }).attrs !== null;
}

export async function elementAttribute(
  element: WebElement,
  name: string,
): Promise<string | null> {
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

export async function csrfTokenFromElement(element: WebElement): Promise<string> {
  const content = await elementAttribute(element, "content");
  if (content) {
    return content;
  }
  throw new Error("Expected CSRF Token not found in HTML content!");
}
