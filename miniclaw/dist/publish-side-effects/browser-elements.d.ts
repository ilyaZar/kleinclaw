import { type WebElement } from "../web-primitives.js";
export declare function elementAttribute(element: WebElement, name: string): Promise<string | null>;
export declare function csrfTokenFromElement(element: WebElement): Promise<string>;
