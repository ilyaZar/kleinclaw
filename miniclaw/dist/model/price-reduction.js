/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { Decimal } from "decimal.js";
export var AdUpdateStrategy;
(function (AdUpdateStrategy) {
    AdUpdateStrategy["Replace"] = "REPLACE";
    AdUpdateStrategy["Modify"] = "MODIFY";
})(AdUpdateStrategy || (AdUpdateStrategy = {}));
function decimalToWholeEuro(value) {
    return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
function floorToWholeEuro(value) {
    return value.toDecimalPlaces(0, Decimal.ROUND_CEIL);
}
function autoPriceTrace(basePrice, autoPriceReduction, targetReductionCycle, withTrace) {
    if (basePrice === null || basePrice === undefined) {
        return { price: null, steps: [], floor: null };
    }
    let price = new Decimal(basePrice);
    if (!autoPriceReduction?.enabled ||
        targetReductionCycle <= 0 ||
        autoPriceReduction.strategy === null ||
        autoPriceReduction.amount === null) {
        return { price: decimalToWholeEuro(price), steps: [], floor: null };
    }
    if (autoPriceReduction.minPrice === null) {
        throw new Error("min_price must be specified when auto_price_reduction is enabled");
    }
    const floor = floorToWholeEuro(new Decimal(autoPriceReduction.minPrice));
    const steps = [];
    for (let index = 0; index < targetReductionCycle; index += 1) {
        const priceBefore = price;
        const reductionValue = autoPriceReduction.strategy === "PERCENTAGE"
            ? price.mul(autoPriceReduction.amount).div(100)
            : new Decimal(autoPriceReduction.amount);
        price = price.minus(reductionValue);
        price = price.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        let floorApplied = false;
        if (price.lte(floor)) {
            price = floor;
            floorApplied = true;
        }
        if (withTrace) {
            steps.push({
                cycle: index + 1,
                priceBefore,
                reductionValue,
                priceAfterRounding: price,
                floorApplied,
            });
        }
    }
    return { price: price.toNumber(), steps, floor };
}
export function calculateAutoPrice({ basePrice, autoPriceReduction, targetReductionCycle, }) {
    return autoPriceTrace(basePrice, autoPriceReduction, targetReductionCycle, false).price;
}
export function calculateAutoPriceWithTrace({ basePrice, autoPriceReduction, targetReductionCycle, }) {
    return autoPriceTrace(basePrice, autoPriceReduction, targetReductionCycle, true);
}
function getNumber(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function dateFromValue(value) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = new Date(value);
        return Number.isNaN(parsed.valueOf()) ? null : parsed;
    }
    return null;
}
function daysSince(reference, now) {
    const millisPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((now.valueOf() - reference.valueOf()) / millisPerDay);
}
function repostDelayState(ad) {
    const cfg = ad.autoPriceReduction ?? ad.auto_price_reduction;
    const totalReposts = getNumber(ad.repostCount ?? ad.repost_count);
    const delayReposts = cfg?.delayReposts ?? 0;
    const appliedCycles = getNumber(ad.priceReductionCount ?? ad.price_reduction_count);
    const eligibleCycles = Math.max(totalReposts - delayReposts, 0);
    return { totalReposts, delayReposts, appliedCycles, eligibleCycles };
}
function dayDelayState(ad, now) {
    const cfg = ad.autoPriceReduction ?? ad.auto_price_reduction;
    const delayDays = cfg?.delayDays ?? 0;
    const reference = dateFromValue(ad.updatedOn ?? ad.updated_on)
        ?? dateFromValue(ad.createdOn ?? ad.created_on);
    if (delayDays === 0) {
        return { ready: true, elapsedDays: 0, reference };
    }
    if (!reference) {
        return { ready: false, elapsedDays: null, reference: null };
    }
    const elapsedDays = daysSince(reference, now);
    return { ready: elapsedDays >= delayDays, elapsedDays, reference };
}
function priceReductionDecision(context, outcome) {
    return {
        ...context,
        enabled: outcome.enabled,
        resultPrice: "resultPrice" in outcome
            ? outcome.resultPrice ?? null
            : context.restoredPrice,
        nextCycle: outcome.nextCycle ?? null,
        cycleAdvanced: outcome.cycleAdvanced ?? false,
        reason: outcome.reason,
        delayRepostsIgnored: outcome.delayRepostsIgnored ?? false,
    };
}
const NON_MUTATING_PRICE_REDUCTION_REASONS = new Set([
    "min_price_equals_price",
    "update_disabled",
    "calculation_failed",
    "repost_delay_waiting",
    "repost_delay_applied",
    "day_delay_waiting",
    "day_delay_missing_timestamp",
]);
function isNonMutatingPriceReductionReason(reason) {
    return NON_MUTATING_PRICE_REDUCTION_REASONS.has(reason);
}
export function evaluateAutoPriceReduction(ad, { mode = AdUpdateStrategy.Replace, now = new Date(), } = {}) {
    const cfg = ad.autoPriceReduction ?? ad.auto_price_reduction;
    const onUpdate = Boolean(cfg?.onUpdate);
    const basePrice = ad.price ?? null;
    const { totalReposts, delayReposts, appliedCycles, eligibleCycles, } = repostDelayState(ad);
    const { ready: dayReady, elapsedDays, reference } = dayDelayState(ad, now);
    const delayDays = cfg?.delayDays ?? 0;
    let restoredPrice = basePrice;
    const decision = (outcome) => priceReductionDecision({
        mode,
        onUpdate,
        basePrice,
        restoredPrice,
        appliedCycles,
        totalReposts,
        delayReposts,
        eligibleCycles,
        delayDays,
        elapsedDays,
        reference,
    }, outcome);
    if (!cfg?.enabled) {
        return decision({
            enabled: false,
            reason: "not_configured",
        });
    }
    if (basePrice === null) {
        return decision({
            enabled: true,
            reason: "missing_price",
        });
    }
    if (appliedCycles > 0) {
        restoredPrice = calculateAutoPrice({
            basePrice,
            autoPriceReduction: cfg,
            targetReductionCycle: appliedCycles,
        });
    }
    if (cfg.minPrice !== null && cfg.minPrice === basePrice && appliedCycles === 0) {
        return decision({
            enabled: true,
            reason: "min_price_equals_price",
        });
    }
    if (mode === AdUpdateStrategy.Modify && !onUpdate) {
        return decision({
            enabled: true,
            reason: "update_disabled",
        });
    }
    let reason = "eligible";
    let delayRepostsIgnored = false;
    if (mode === AdUpdateStrategy.Replace) {
        if (totalReposts <= delayReposts) {
            reason = "repost_delay_waiting";
        }
        else if (eligibleCycles <= appliedCycles) {
            reason = "repost_delay_applied";
        }
        else if (!dayReady) {
            reason = reference ? "day_delay_waiting" : "day_delay_missing_timestamp";
        }
    }
    else {
        delayRepostsIgnored = delayReposts > 0;
        if (!dayReady) {
            reason = reference ? "day_delay_waiting" : "day_delay_missing_timestamp";
        }
    }
    if (reason !== "eligible") {
        return decision({
            enabled: true,
            reason,
            delayRepostsIgnored,
        });
    }
    const nextCycle = appliedCycles + 1;
    const resultPrice = calculateAutoPrice({
        basePrice,
        autoPriceReduction: cfg,
        targetReductionCycle: nextCycle,
    });
    if (resultPrice === null) {
        return decision({
            enabled: true,
            resultPrice: null,
            reason: "calculation_failed",
            delayRepostsIgnored,
        });
    }
    const cycleAdvanced = resultPrice !== restoredPrice;
    return decision({
        enabled: true,
        resultPrice,
        nextCycle,
        cycleAdvanced,
        reason: cycleAdvanced ? "eligible" : "no_visible_change",
        delayRepostsIgnored,
    });
}
export function applyAutoPriceReduction(ad, options = {}) {
    const decision = evaluateAutoPriceReduction(ad, options);
    if (!decision.enabled || decision.basePrice === null) {
        return decision;
    }
    if (decision.restoredPrice !== null) {
        ad.price = decision.restoredPrice;
    }
    if (isNonMutatingPriceReductionReason(decision.reason)) {
        return decision;
    }
    if (decision.reason === "no_visible_change" && decision.nextCycle !== null) {
        ad.priceReductionCount = decision.nextCycle;
        ad.price_reduction_count = decision.nextCycle;
        return decision;
    }
    if (decision.resultPrice !== null && decision.nextCycle !== null) {
        ad.price = decision.resultPrice;
        ad.priceReductionCount = decision.nextCycle;
        ad.price_reduction_count = decision.nextCycle;
    }
    return decision;
}
