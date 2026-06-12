/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

const CSS_META_CHARS = new Set(
  "!\"#$%&'()*+,./:;<=>?@[\\]^`{|}~".split(""),
);

export enum By {
  ID = "ID",
  CLASS_NAME = "CLASS_NAME",
  CSS_SELECTOR = "CSS_SELECTOR",
  TAG_NAME = "TAG_NAME",
  TEXT = "TEXT",
  XPATH = "XPATH",
}

export type WebSelector = readonly [By, string];

export function escapeCssMeta(value: string): string {
  return [...value]
    .map((char) => CSS_META_CHARS.has(char) ? `\\${char}` : char)
    .join("");
}

export function selectorFor(type: By, value: string): string {
  switch (type) {
    case By.ID:
      return `#${escapeCssMeta(value)}`;
    case By.CLASS_NAME:
      return `.${escapeCssMeta(value)}`;
    case By.CSS_SELECTOR:
    case By.TAG_NAME:
      return value;
    case By.TEXT:
      return `text=${value}`;
    case By.XPATH:
      return `xpath=${value}`;
  }
}
