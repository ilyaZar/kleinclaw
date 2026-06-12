/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  AdDefaults,
  AutoPriceReductionConfig,
  type AutoPriceReductionConfigInput,
} from "./ad-defaults-config.js";
import { dateFromValue } from "./price-reduction.js";
import { parseShippingCosts } from "./shipping.js";
import { ValidationError } from "./validation-error.js";

export const MIN_TITLE_LENGTH = 10;
export const MAX_TITLE_LENGTH = 65;
export const MAX_DESCRIPTION_LENGTH = 4000;

export interface ContactInput {
  name?: string | null;
  street?: string | null;
  zipcode?: number | string | null;
  location?: string | null;
  phone?: string | null;
}

export interface AdInput extends Record<string, unknown> {
  active?: boolean | null;
  type?: "OFFER" | "WANTED" | null;
  title?: string | null;
  description?: string | null;
  description_prefix?: string | null;
  description_suffix?: string | null;
  category?: string | null;
  special_attributes?: Record<string, string> | null;
  price?: number | null;
  price_type?: "FIXED" | "NEGOTIABLE" | "GIVE_AWAY" | "NOT_APPLICABLE" | null;
  auto_price_reduction?: AutoPriceReductionConfigInput | null;
  shipping_type?: "PICKUP" | "SHIPPING" | "NOT_APPLICABLE" | null;
  shipping_costs?: number | string | unknown[] | null;
  shipping_options?: string[] | null;
  sell_directly?: boolean | null;
  images?: string[] | null;
  contact?: ContactInput | null;
  republication_interval?: number | null;
  id?: number | string | null;
  created_on?: string | Date | null;
  updated_on?: string | Date | null;
  content_hash?: string | null;
  repost_count?: number | null;
  price_reduction_count?: number | null;
}

export interface Ad {
  active: boolean;
  type: "OFFER" | "WANTED";
  title: string;
  description: string;
  descriptionPrefix: string;
  descriptionSuffix: string;
  category: string;
  specialAttributes: Record<string, string> | null;
  price: number | null;
  priceType: "FIXED" | "NEGOTIABLE" | "GIVE_AWAY" | "NOT_APPLICABLE";
  autoPriceReduction: AutoPriceReductionConfig;
  shippingType: "PICKUP" | "SHIPPING" | "NOT_APPLICABLE";
  shippingCosts: number | null;
  shippingOptions: string[] | null;
  sellDirectly: boolean;
  images: string[];
  contact: {
    name: string;
    street: string;
    zipcode: number | string;
    location: string;
    phone: string;
  };
  republicationInterval: number;
  id: number | null;
  createdOn: Date | null;
  updatedOn: Date | null;
  contentHash: string | null;
  repostCount: number;
  priceReductionCount: number;
}

function valueOrDefault<T>(value: T | null | undefined, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string" && value === "") {
    return fallback;
  }
  return value;
}

function parseId(value: AdInput["id"]): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ValidationError("id must be an integer");
  }
  return parsed;
}

export function toAd(input: AdInput, defaults = new AdDefaults()): Ad {
  if (input.title === null || input.title === undefined) {
    throw new ValidationError("title is required");
  }
  const title = valueOrDefault(input.title, "");
  if (title.length < MIN_TITLE_LENGTH) {
    throw new ValidationError(
      `title length must be at least ${MIN_TITLE_LENGTH} characters`,
    );
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(
      `title length exceeds ${MAX_TITLE_LENGTH} characters`,
    );
  }

  if (input.description === null || input.description === undefined) {
    throw new ValidationError("description is required");
  }
  const description = input.description;
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(
      `description length exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }

  if (input.category === null || input.category === undefined) {
    throw new ValidationError("category is required");
  }
  const category = input.category;
  const price = input.price ?? null;
  const priceType = valueOrDefault(input.price_type, defaults.priceType);
  const autoPriceReduction = new AutoPriceReductionConfig(
    input.auto_price_reduction ?? defaults.autoPriceReduction,
  );

  if (priceType === "GIVE_AWAY" && price !== null) {
    throw new ValidationError(
      "price must not be specified when price_type is GIVE_AWAY",
    );
  }
  if (priceType === "FIXED" && price === null) {
    throw new ValidationError("price is required when price_type is FIXED");
  }
  if (autoPriceReduction.enabled) {
    if (price === null) {
      throw new ValidationError(
        "price must be specified when auto_price_reduction is enabled",
      );
    }
    if (
      autoPriceReduction.minPrice !== null &&
      autoPriceReduction.minPrice > price
    ) {
      throw new ValidationError("min_price must not exceed price");
    }
  }

  const contact = input.contact ?? {};
  return {
    active: valueOrDefault(input.active, defaults.active),
    type: valueOrDefault(input.type, defaults.type),
    title,
    description,
    descriptionPrefix: valueOrDefault(
      input.description_prefix,
      defaults.descriptionPrefix,
    ),
    descriptionSuffix: valueOrDefault(
      input.description_suffix,
      defaults.descriptionSuffix,
    ),
    category,
    specialAttributes:
      input.special_attributes === undefined || input.special_attributes === null
        ? null
        : { ...input.special_attributes },
    price,
    priceType,
    autoPriceReduction,
    shippingType: valueOrDefault(input.shipping_type, defaults.shippingType),
    shippingCosts: parseShippingCosts(input.shipping_costs),
    shippingOptions:
      input.shipping_options === undefined || input.shipping_options === null
        ? null
        : [...input.shipping_options],
    sellDirectly: valueOrDefault(input.sell_directly, defaults.sellDirectly),
    images: [...(input.images ?? defaults.images)],
    contact: {
      name: valueOrDefault(contact.name, defaults.contact.name),
      street: valueOrDefault(contact.street, defaults.contact.street),
      zipcode: valueOrDefault(contact.zipcode, defaults.contact.zipcode),
      location: valueOrDefault(contact.location, defaults.contact.location),
      phone: valueOrDefault(contact.phone, defaults.contact.phone),
    },
    republicationInterval: valueOrDefault(
      input.republication_interval,
      defaults.republicationInterval,
    ),
    id: parseId(input.id),
    createdOn: dateFromValue(input.created_on),
    updatedOn: dateFromValue(input.updated_on),
    contentHash: input.content_hash ?? null,
    repostCount: input.repost_count ?? 0,
    priceReductionCount: input.price_reduction_count ?? 0,
  };
}
