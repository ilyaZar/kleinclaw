import { type WebElement } from "../web-primitives.js";
export interface SpecialAttributeElementInfo {
    id: string | null;
    localName: string;
    name: string | null;
    role: string;
    type: string;
    checked: unknown;
}
export declare function xpathLiteral(value: string): string;
export declare function visibleElementText(element: WebElement): Promise<string>;
export declare function elementInputValue(element: WebElement): Promise<string>;
export declare function elementAttribute(element: WebElement, name: string): Promise<unknown>;
export declare function elementHasAttribute(element: WebElement, name: string): Promise<boolean>;
export declare function elementLocalName(element: WebElement): Promise<string>;
export declare function stringOrNull(value: unknown): string | null;
export declare function inspectSpecialAttributeElement(element: WebElement): Promise<SpecialAttributeElementInfo>;
export declare function clickElement(element: WebElement, errorMessage: string): Promise<void>;
