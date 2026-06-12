export declare enum By {
    ID = "ID",
    CLASS_NAME = "CLASS_NAME",
    CSS_SELECTOR = "CSS_SELECTOR",
    TAG_NAME = "TAG_NAME",
    TEXT = "TEXT",
    XPATH = "XPATH"
}
export type WebSelector = readonly [By, string];
export declare function escapeCssMeta(value: string): string;
export declare function selectorFor(type: By, value: string): string;
