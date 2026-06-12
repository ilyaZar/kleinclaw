import { type Ad } from "./ad-normalization.js";
export type JsonValue = null | boolean | number | string | HashFloatValue | JsonValue[] | {
    [key: string]: JsonValue | undefined;
};
interface HashFloatValue {
    readonly __contentHashFloat: true;
    readonly value: number;
}
export declare function contentHashForAd(ad: Record<string, unknown>): string;
export declare function adToContentHashInput(ad: Ad): Record<string, unknown>;
export declare function contentHashForLoadedAd(ad: Ad): string;
export {};
