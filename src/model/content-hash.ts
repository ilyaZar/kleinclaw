/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { createHash } from "node:crypto";

import { isRecord } from "../value-guards.js";
import { type Ad } from "./ad-normalization.js";
import { type AutoPriceReductionConfig } from "./ad-defaults-config.js";
import { parseShippingCosts, type ShippingCostsInput } from "./shipping.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | HashFloatValue
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

interface HashFloatValue {
  readonly __contentHashFloat: true;
  readonly value: number;
}

const METADATA_FIELDS = new Set([
  "id",
  "created_on",
  "createdOn",
  "updated_on",
  "updatedOn",
  "content_hash",
  "contentHash",
  "repost_count",
  "repostCount",
  "price_reduction_count",
  "priceReductionCount",
]);

function hashFloat(value: number | null): HashFloatValue | null {
  return value === null ? null : { __contentHashFloat: true, value };
}

function isHashFloatValue(value: unknown): value is HashFloatValue {
  return isRecord(value) && value.__contentHashFloat === true;
}

function pruneForHash(value: unknown, key = ""): JsonValue | undefined {
  if (METADATA_FIELDS.has(key)) {
    return undefined;
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  if (isHashFloatValue(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => pruneForHash(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
    return items.length ? items : undefined;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([childKey, childValue]) => [
        childKey,
        pruneForHash(childValue, childKey),
      ] as const)
      .filter(([, childValue]) => childValue !== undefined);
    if (!entries.length) {
      return undefined;
    }
    return Object.fromEntries(entries) as JsonValue;
  }
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  return undefined;
}

function escapeJsonStringForHash(value: string): string {
  const escaped = JSON.stringify(value);
  if (escaped === undefined) {
    throw new Error("failed to encode JSON string");
  }
  return escaped.replace(/[^\x00-\x7F]/g, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      return character;
    }
    if (codePoint <= 0xFFFF) {
      return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    }
    const high = Math.floor((codePoint - 0x10000) / 0x400) + 0xD800;
    const low = ((codePoint - 0x10000) % 0x400) + 0xDC00;
    return `\\u${high.toString(16)}\\u${low.toString(16)}`;
  });
}

function serializeJsonForHash(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (isHashFloatValue(value)) {
    return Number.isInteger(value.value)
      ? `${value.value}.0`
      : String(value.value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === "string") {
    return escapeJsonStringForHash(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeJsonForHash(entry)).join(", ")}]`;
  }
  const parts = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => {
      const dumped = serializeJsonForHash(value[key] as JsonValue);
      return `${escapeJsonStringForHash(key)}: ${dumped}`;
    });
  return `{${parts.join(", ")}}`;
}

function normalizeAutoPriceReductionForHash(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const result: Record<string, unknown> = { ...value };
  for (const key of ["amount", "min_price"]) {
    const candidate = result[key];
    if (
      candidate === null ||
      candidate === undefined ||
      isHashFloatValue(candidate)
    ) {
      continue;
    }
    const parsed = Number(candidate);
    result[key] = Number.isFinite(parsed) ? hashFloat(parsed) : candidate;
  }
  return result;
}

function normalizeAdForHash(ad: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...ad };
  if ("shipping_costs" in result && !isHashFloatValue(result.shipping_costs)) {
    const parsed = parseShippingCosts(
      result.shipping_costs as ShippingCostsInput,
    );
    result.shipping_costs = hashFloat(parsed);
  }
  if ("auto_price_reduction" in result) {
    result.auto_price_reduction = normalizeAutoPriceReductionForHash(
      result.auto_price_reduction,
    );
  }
  return result;
}

export function contentHashForAd(ad: Record<string, unknown>): string {
  const pruned = pruneForHash(normalizeAdForHash(ad));
  const json = serializeJsonForHash(isRecord(pruned) ? pruned : {});
  return createHash("sha256").update(json).digest("hex");
}

function autoPriceReductionToHashInput(
  config: AutoPriceReductionConfig,
): Record<string, unknown> {
  return {
    enabled: config.enabled,
    strategy: config.strategy,
    amount: hashFloat(config.amount),
    min_price: hashFloat(config.minPrice),
    delay_reposts: config.delayReposts,
    delay_days: config.delayDays,
    on_update: config.onUpdate,
  };
}

export function adToContentHashInput(ad: Ad): Record<string, unknown> {
  return {
    active: ad.active,
    type: ad.type,
    title: ad.title,
    description: ad.description,
    description_prefix: ad.descriptionPrefix,
    description_suffix: ad.descriptionSuffix,
    category: ad.category,
    special_attributes: ad.specialAttributes,
    price: ad.price,
    price_type: ad.priceType,
    auto_price_reduction: autoPriceReductionToHashInput(ad.autoPriceReduction),
    shipping_type: ad.shippingType,
    shipping_costs: hashFloat(ad.shippingCosts),
    shipping_options: ad.shippingOptions,
    sell_directly: ad.sellDirectly,
    images: ad.images,
    contact: ad.contact,
    republication_interval: ad.republicationInterval,
    id: ad.id,
    created_on: ad.createdOn?.toISOString() ?? null,
    updated_on: ad.updatedOn?.toISOString() ?? null,
    content_hash: ad.contentHash,
    repost_count: ad.repostCount,
    price_reduction_count: ad.priceReductionCount,
  };
}

export function contentHashForLoadedAd(ad: Ad): string {
  return contentHashForAd(adToContentHashInput(ad));
}
