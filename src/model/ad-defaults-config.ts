/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { ValidationError } from "./validation-error.js";

export type AutoPriceReductionStrategy = "FIXED" | "PERCENTAGE";

export interface AutoPriceReductionConfigInput {
  enabled?: boolean;
  strategy?: AutoPriceReductionStrategy | null;
  amount?: number | null;
  minPrice?: number | null;
  min_price?: number | null;
  delayReposts?: number;
  delay_reposts?: number;
  delayDays?: number;
  delay_days?: number;
  onUpdate?: boolean;
  on_update?: boolean;
}

export class AutoPriceReductionConfig {
  readonly enabled: boolean;
  readonly strategy: AutoPriceReductionStrategy | null;
  readonly amount: number | null;
  readonly minPrice: number | null;
  readonly delayReposts: number;
  readonly delayDays: number;
  readonly onUpdate: boolean;

  constructor(input: AutoPriceReductionConfigInput = {}) {
    this.enabled = input.enabled ?? false;
    this.strategy = input.strategy ?? null;
    this.amount = input.amount ?? null;
    this.minPrice = input.minPrice ?? input.min_price ?? null;
    this.delayReposts = input.delayReposts ?? input.delay_reposts ?? 0;
    this.delayDays = input.delayDays ?? input.delay_days ?? 0;
    this.onUpdate = input.onUpdate ?? input.on_update ?? false;

    this.validate();
  }

  private validate(): void {
    if (this.amount !== null && this.amount <= 0) {
      throw new ValidationError("amount must be greater than 0");
    }
    if (this.minPrice !== null && this.minPrice < 0) {
      throw new ValidationError("min_price must be greater than or equal to 0");
    }
    if (this.delayReposts < 0) {
      throw new ValidationError("delay_reposts must be greater than or equal to 0");
    }
    if (this.delayDays < 0) {
      throw new ValidationError("delay_days must be greater than or equal to 0");
    }
    if (!this.enabled) {
      return;
    }
    if (this.strategy === null) {
      throw new ValidationError(
        "strategy must be specified when auto_price_reduction is enabled",
      );
    }
    if (this.amount === null) {
      throw new ValidationError(
        "amount must be specified when auto_price_reduction is enabled",
      );
    }
    if (this.minPrice === null) {
      throw new ValidationError(
        "min_price must be specified when auto_price_reduction is enabled",
      );
    }
    if (this.strategy === "PERCENTAGE" && this.amount > 100) {
      throw new ValidationError(
        "Percentage reduction amount must not exceed 100",
      );
    }
  }
}

export interface ContactDefaultsInput {
  name?: string | null;
  street?: string | null;
  zipcode?: number | string | null;
  location?: string | null;
  phone?: string | null;
}

export class ContactDefaults {
  readonly name: string;
  readonly street: string;
  readonly zipcode: number | string;
  readonly location: string;
  readonly phone: string;

  constructor(input: ContactDefaultsInput = {}) {
    this.name = input.name ?? "";
    this.street = input.street ?? "";
    this.zipcode = input.zipcode ?? "";
    this.location = input.location ?? "";
    this.phone = input.phone ?? "";
  }
}

export interface AdDefaultsInput {
  active?: boolean | null;
  type?: "OFFER" | "WANTED" | null;
  description?: { prefix?: string | null; suffix?: string | null } | null;
  descriptionPrefix?: string | null;
  description_prefix?: string | null;
  descriptionSuffix?: string | null;
  description_suffix?: string | null;
  priceType?: "FIXED" | "NEGOTIABLE" | "GIVE_AWAY" | "NOT_APPLICABLE" | null;
  price_type?: "FIXED" | "NEGOTIABLE" | "GIVE_AWAY" | "NOT_APPLICABLE" | null;
  autoPriceReduction?: AutoPriceReductionConfigInput | null;
  auto_price_reduction?: AutoPriceReductionConfigInput | null;
  shippingType?: "PICKUP" | "SHIPPING" | "NOT_APPLICABLE" | null;
  shipping_type?: "PICKUP" | "SHIPPING" | "NOT_APPLICABLE" | null;
  sellDirectly?: boolean | null;
  sell_directly?: boolean | null;
  images?: string[] | null;
  contact?: ContactDefaultsInput | null;
  republicationInterval?: number | null;
  republication_interval?: number | null;
}

export class AdDefaults {
  readonly active: boolean;
  readonly type: "OFFER" | "WANTED";
  readonly descriptionPrefix: string;
  readonly descriptionSuffix: string;
  readonly priceType: "FIXED" | "NEGOTIABLE" | "GIVE_AWAY" | "NOT_APPLICABLE";
  readonly autoPriceReduction: AutoPriceReductionConfig;
  readonly shippingType: "PICKUP" | "SHIPPING" | "NOT_APPLICABLE";
  readonly sellDirectly: boolean;
  readonly images: string[];
  readonly contact: ContactDefaults;
  readonly republicationInterval: number;

  constructor(input: AdDefaultsInput = {}) {
    this.active = input.active ?? true;
    this.type = input.type ?? "OFFER";
    this.descriptionPrefix =
      input.descriptionPrefix ??
      input.description_prefix ??
      input.description?.prefix ??
      "";
    this.descriptionSuffix =
      input.descriptionSuffix ??
      input.description_suffix ??
      input.description?.suffix ??
      "";
    this.priceType = input.priceType ?? input.price_type ?? "NEGOTIABLE";
    this.autoPriceReduction = new AutoPriceReductionConfig(
      input.autoPriceReduction ?? input.auto_price_reduction ?? {},
    );
    this.shippingType = input.shippingType ?? input.shipping_type ?? "SHIPPING";
    this.sellDirectly = input.sellDirectly ?? input.sell_directly ?? false;
    this.images = [...(input.images ?? [])];
    this.contact = new ContactDefaults(input.contact ?? {});
    this.republicationInterval =
      input.republicationInterval ?? input.republication_interval ?? 7;
  }
}
