/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { ValidationError } from "./validation-error.js";

export const CARRIER_CODE_BY_OPTION: Record<string, string> = {
  DHL_2: "DHL_001",
  "Hermes_Päckchen": "HERMES_001",
  Hermes_S: "HERMES_002",
  DHL_5: "DHL_002",
  Hermes_M: "HERMES_003",
  DHL_10: "DHL_003",
  DHL_20: "DHL_005",
  "DHL_31,5": "DHL_004",
  Hermes_L: "HERMES_004",
};

export const OPTION_NAME_BY_CARRIER_CODE: Record<string, string> =
  Object.fromEntries(
    Object.entries(CARRIER_CODE_BY_OPTION).map(([option, code]) => [
      code,
      option,
    ]),
  );

export const SIZE_INFO_BY_CARRIER_CODE: Record<string, [string, string]> = {
  HERMES_001: ["Klein", "SMALL"],
  HERMES_002: ["Klein", "SMALL"],
  DHL_001: ["Klein", "SMALL"],
  HERMES_003: ["Mittel", "MEDIUM"],
  DHL_002: ["Mittel", "MEDIUM"],
  HERMES_004: ["Groß", "LARGE"],
  DHL_003: ["Groß", "LARGE"],
  DHL_004: ["Groß", "LARGE"],
  DHL_005: ["Groß", "LARGE"],
};

export const CARRIER_CODES_BY_SIZE: Record<string, string[]> = {
  Klein: ["HERMES_001", "HERMES_002", "DHL_001"],
  Mittel: ["HERMES_003", "DHL_002"],
  Groß: ["HERMES_004", "DHL_003", "DHL_004", "DHL_005"],
};

export const SHIPPING_OPTIONS = new Set(Object.keys(CARRIER_CODE_BY_OPTION));

export type ShippingCostsInput =
  | number
  | string
  | unknown[]
  | null
  | undefined;

export function parseShippingCosts(value: ShippingCostsInput): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && !value.trim()) {
    return null;
  }
  if (Array.isArray(value)) {
    const candidate = value.length === 1 ? value[0] : null;
    if (typeof candidate === "string" && SHIPPING_OPTIONS.has(candidate)) {
      throw new ValidationError(
        `shipping_costs expects a numeric value. Did you mean shipping_options: ['${candidate}']?`,
      );
    }
    throw new ValidationError(
      "shipping_costs expects a numeric value like 4.95, not a list/sequence",
    );
  }
  if (typeof value === "string" && SHIPPING_OPTIONS.has(value)) {
    throw new ValidationError(
      `shipping_costs expects a numeric value. Did you mean shipping_options: ['${value}']?`,
    );
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError("shipping_costs expects a numeric value");
  }
  return Math.round(parsed * 100) / 100;
}
