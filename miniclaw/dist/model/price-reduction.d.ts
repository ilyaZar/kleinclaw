import { Decimal } from "decimal.js";
import { type AutoPriceReductionConfig } from "./ad-defaults-config.js";
export declare enum AdUpdateStrategy {
    Replace = "REPLACE",
    Modify = "MODIFY"
}
export interface PriceReductionStep {
    cycle: number;
    priceBefore: Decimal;
    reductionValue: Decimal;
    priceAfterRounding: Decimal;
    floorApplied: boolean;
}
export interface AutoPriceTrace {
    price: number | null;
    steps: PriceReductionStep[];
    floor: Decimal | null;
}
export interface AdLike {
    [key: string]: unknown;
    price?: number | null;
    autoPriceReduction?: AutoPriceReductionConfig | null;
    auto_price_reduction?: AutoPriceReductionConfig | null;
    repostCount?: number | null;
    repost_count?: number | null;
    priceReductionCount?: number | null;
    price_reduction_count?: number | null;
    createdOn?: Date | string | null;
    created_on?: Date | string | null;
    updatedOn?: Date | string | null;
    updated_on?: Date | string | null;
}
export interface PriceReductionDecision {
    mode: AdUpdateStrategy;
    enabled: boolean;
    onUpdate: boolean;
    basePrice: number | null;
    restoredPrice: number | null;
    resultPrice: number | null;
    appliedCycles: number;
    nextCycle: number | null;
    cycleAdvanced: boolean;
    reason: string;
    totalReposts: number;
    delayReposts: number;
    eligibleCycles: number;
    delayDays: number;
    elapsedDays: number | null;
    reference: Date | null;
    delayRepostsIgnored: boolean;
}
export declare function calculateAutoPrice({ basePrice, autoPriceReduction, targetReductionCycle, }: {
    basePrice: number | null | undefined;
    autoPriceReduction?: AutoPriceReductionConfig | null;
    targetReductionCycle: number;
}): number | null;
export declare function calculateAutoPriceWithTrace({ basePrice, autoPriceReduction, targetReductionCycle, }: {
    basePrice: number | null | undefined;
    autoPriceReduction?: AutoPriceReductionConfig | null;
    targetReductionCycle: number;
}): AutoPriceTrace;
export declare function dateFromValue(value: unknown): Date | null;
export declare function evaluateAutoPriceReduction(ad: AdLike, { mode, now, }?: {
    mode?: AdUpdateStrategy;
    now?: Date;
}): PriceReductionDecision;
export declare function applyAutoPriceReduction(ad: AdLike, options?: {
    mode?: AdUpdateStrategy;
    now?: Date;
}): PriceReductionDecision;
