/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type WebElement } from "../web-primitives.js";

export async function elementAttribute(
  element: WebElement,
  name: string,
): Promise<string | null> {
  if (element.getAttribute) {
    return element.getAttribute(name);
  }
  const attrs = (element as { attrs?: Record<string, unknown> }).attrs;
  if (!attrs) {
    return null;
  }
  const value = attrs[name];
  return value === null || value === undefined ? null : String(value);
}
