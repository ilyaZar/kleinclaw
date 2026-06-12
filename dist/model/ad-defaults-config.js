/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { ValidationError } from "./validation-error.js";
export class AutoPriceReductionConfig {
    enabled;
    strategy;
    amount;
    minPrice;
    delayReposts;
    delayDays;
    onUpdate;
    constructor(input = {}) {
        this.enabled = input.enabled ?? false;
        this.strategy = input.strategy ?? null;
        this.amount = input.amount ?? null;
        this.minPrice = input.minPrice ?? input.min_price ?? null;
        this.delayReposts = input.delayReposts ?? input.delay_reposts ?? 0;
        this.delayDays = input.delayDays ?? input.delay_days ?? 0;
        this.onUpdate = input.onUpdate ?? input.on_update ?? false;
        this.validate();
    }
    validate() {
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
            throw new ValidationError("strategy must be specified when auto_price_reduction is enabled");
        }
        if (this.amount === null) {
            throw new ValidationError("amount must be specified when auto_price_reduction is enabled");
        }
        if (this.minPrice === null) {
            throw new ValidationError("min_price must be specified when auto_price_reduction is enabled");
        }
        if (this.strategy === "PERCENTAGE" && this.amount > 100) {
            throw new ValidationError("Percentage reduction amount must not exceed 100");
        }
    }
}
export class ContactDefaults {
    name;
    street;
    zipcode;
    location;
    phone;
    constructor(input = {}) {
        this.name = input.name ?? "";
        this.street = input.street ?? "";
        this.zipcode = input.zipcode ?? "";
        this.location = input.location ?? "";
        this.phone = input.phone ?? "";
    }
}
export class AdDefaults {
    active;
    type;
    descriptionPrefix;
    descriptionSuffix;
    priceType;
    autoPriceReduction;
    shippingType;
    sellDirectly;
    images;
    contact;
    republicationInterval;
    constructor(input = {}) {
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
        this.autoPriceReduction = new AutoPriceReductionConfig(input.autoPriceReduction ?? input.auto_price_reduction ?? {});
        this.shippingType = input.shippingType ?? input.shipping_type ?? "SHIPPING";
        this.sellDirectly = input.sellDirectly ?? input.sell_directly ?? false;
        this.images = [...(input.images ?? [])];
        this.contact = new ContactDefaults(input.contact ?? {});
        this.republicationInterval =
            input.republicationInterval ?? input.republication_interval ?? 7;
    }
}
