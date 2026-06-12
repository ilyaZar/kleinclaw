export declare const CARRIER_CODE_BY_OPTION: Record<string, string>;
export declare const OPTION_NAME_BY_CARRIER_CODE: Record<string, string>;
export declare const SIZE_INFO_BY_CARRIER_CODE: Record<string, [string, string]>;
export declare const CARRIER_CODES_BY_SIZE: Record<string, string[]>;
export declare const SHIPPING_OPTIONS: Set<string>;
export type ShippingCostsInput = number | string | unknown[] | null | undefined;
export declare function parseShippingCosts(value: ShippingCostsInput): number | null;
