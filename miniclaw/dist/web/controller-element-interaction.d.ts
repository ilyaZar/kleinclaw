import { ControllerFinding, type FirstAvailableOptions } from "./controller-finding.js";
import { By, type WebSelector } from "./selector.js";
import { Is, type WebElement, type WebLocator } from "./types.js";
type FirstAvailableTextOptions = FirstAvailableOptions & {
    fallbackToTextContent?: boolean;
};
export declare class ControllerElementInteraction extends ControllerFinding {
    webTextFirstAvailable(selectors: readonly WebSelector[], { description, fallbackToTextContent, key, parent, timeout, }?: FirstAvailableTextOptions): Promise<[string, number]>;
    webTextFirstAvailableOnce(selectors: readonly WebSelector[], { description, fallbackToTextContent, key, parent, timeout, }?: FirstAvailableTextOptions): Promise<[string, number]>;
    webCheck(type: By, value: string, attr: Is, timeout?: number): Promise<boolean>;
    webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
    clearInput(element: WebElement): Promise<void>;
    dispatchArrowDownAndEnter(element: WebElement): Promise<void>;
    webInput(type: By, value: string, text: string | number, timeout?: number): Promise<WebLocator>;
    webText(type: By, value: string, { parent, timeout, }?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<string>;
    private textOf;
    extractVisibleText(element: WebElement): Promise<string>;
    protected inputText(element: WebElement, text: string): Promise<void>;
    private isDisabled;
    private isDisplayed;
    private isSelected;
}
export {};
