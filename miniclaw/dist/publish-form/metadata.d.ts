import { AdUpdateStrategy, type Ad } from "../model/ad-model.js";
export declare function updateAdConfigAfterPublish(adConfig: Record<string, unknown>, ad: Pick<Ad, "createdOn" | "id" | "priceReductionCount" | "repostCount">, adId: number, mode?: AdUpdateStrategy, now?: Date): Record<string, unknown>;
