import { type TimeoutKey } from "../model/config-model.js";
import { By, type WebSelector } from "./selector.js";
import { Is, type WebControllerOptions, type WebElement, type WebLocator, type WebPage, type WebRequestOptions, type WebResponse } from "./types.js";
type FirstAvailableOptions = {
    description?: string;
    key?: TimeoutKey;
    parent?: WebLocator | null;
    timeout?: number;
};
export declare class WebController {
    readonly page: WebPage;
    readonly defaultTimeout: number;
    private readonly timeSource;
    private readonly timeoutConfig;
    private readonly timingCollector;
    private readonly defaultTimeoutOverride;
    private readonly sleepRangeMs;
    private readonly randomInt;
    private readonly sleeper;
    constructor(page: WebPage, options?: WebControllerOptions);
    locatorFor(type: By, value: string, parent?: WebLocator | null): WebLocator;
    webExecute(jscode: string): Promise<unknown>;
    webRequest(url: string, method?: string, validResponseCodes?: number | Iterable<number>, headers?: Record<string, string> | null, { timeout }?: WebRequestOptions): Promise<WebResponse>;
    webFind(type: By, value: string, { parent, timeout, }?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<WebLocator>;
    webFindFirstAvailable(selectors: readonly WebSelector[], { description, key, parent, timeout, }?: FirstAvailableOptions): Promise<[WebLocator, number]>;
    webFindFirstAvailableOnce(selectors: readonly WebSelector[], { description, key, parent, timeout, }?: FirstAvailableOptions): Promise<[WebLocator, number]>;
    webTextFirstAvailable(selectors: readonly WebSelector[], { description, key, parent, timeout, }?: FirstAvailableOptions): Promise<[string, number]>;
    webTextFirstAvailableOnce(selectors: readonly WebSelector[], { description, key, parent, timeout, }?: FirstAvailableOptions): Promise<[string, number]>;
    private webFindFirstAvailableWithinBudget;
    private webFindOnce;
    webProbe(type: By, value: string, { parent, timeout, }?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<WebLocator | null>;
    webFindAll(type: By, value: string, { parent, timeout, }?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<WebElement[]>;
    private webFindAllOnce;
    webCheck(type: By, value: string, attr: Is, timeout?: number): Promise<boolean>;
    webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
    clearInput(element: WebElement): Promise<void>;
    dispatchArrowDownAndEnter(element: WebElement): Promise<void>;
    webInput(type: By, value: string, text: string | number, timeout?: number): Promise<WebLocator>;
    webText(type: By, value: string, { parent, timeout, }?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<string>;
    extractVisibleText(element: WebElement): Promise<string>;
    webSelect(type: By, value: string, selectedValue: unknown, timeout?: number): Promise<WebLocator>;
    webSelectCombobox(type: By, value: string, selectedValue: string | number, timeout?: number): Promise<WebElement>;
    webSelectButtonCombobox(elementId: string, selectedValue: string, timeout?: number): Promise<WebElement>;
    webAwait<T>(condition: () => T | Promise<T>, { timeout, timeoutErrorMessage, applyMultiplier, }?: {
        timeout?: number | null;
        timeoutErrorMessage?: string;
        applyMultiplier?: boolean;
    }): Promise<T>;
    webOpen(url: string, { timeout, reloadIfAlreadyOpen, }?: {
        timeout?: number;
        reloadIfAlreadyOpen?: boolean;
    }): Promise<void>;
    webSleep(minMs?: number, maxMs?: number): Promise<void>;
    webScrollPageDown(scrollLength?: number, scrollSpeed?: number, { scrollBackTop, }?: {
        scrollBackTop?: boolean;
    }): Promise<void>;
    private isDisabled;
    private isDisplayed;
    private isSelected;
    private inputText;
    private selectOption;
    private clickMatchingComboboxOption;
    private clickMatchingButtonComboboxOption;
    private confirmComboboxFallback;
    private currentInputValue;
    private withTimeout;
    private baseTimeout;
    private effectiveTimeout;
    private timeoutAttempts;
    private recordTiming;
    private runWithTimeoutRetries;
    private notFoundMessage;
}
export {};
