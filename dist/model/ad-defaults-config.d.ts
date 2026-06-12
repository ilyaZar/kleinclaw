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
export declare class AutoPriceReductionConfig {
    readonly enabled: boolean;
    readonly strategy: AutoPriceReductionStrategy | null;
    readonly amount: number | null;
    readonly minPrice: number | null;
    readonly delayReposts: number;
    readonly delayDays: number;
    readonly onUpdate: boolean;
    constructor(input?: AutoPriceReductionConfigInput);
    private validate;
}
export interface ContactDefaultsInput {
    name?: string | null;
    street?: string | null;
    zipcode?: number | string | null;
    location?: string | null;
    phone?: string | null;
}
export declare class ContactDefaults {
    readonly name: string;
    readonly street: string;
    readonly zipcode: number | string;
    readonly location: string;
    readonly phone: string;
    constructor(input?: ContactDefaultsInput);
}
export interface AdDefaultsInput {
    active?: boolean | null;
    type?: "OFFER" | "WANTED" | null;
    description?: {
        prefix?: string | null;
        suffix?: string | null;
    } | null;
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
export declare class AdDefaults {
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
    constructor(input?: AdDefaultsInput);
}
