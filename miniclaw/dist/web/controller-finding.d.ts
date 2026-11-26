import { type TimeoutKey } from "../model/timeout-config.js";
import { ControllerTiming } from "./controller-timing.js";
import { By, type WebSelector } from "./selector.js";
import { type WebElement, type WebLocator } from "./types.js";
type LocatorOptions = {
    parent?: WebLocator | null;
    timeout?: number;
};
export type FirstAvailableOptions = {
    description?: string;
    key?: TimeoutKey;
    parent?: WebLocator | null;
    timeout?: number;
};
export declare class ControllerFinding extends ControllerTiming {
    locatorFor(type: By, value: string, parent?: WebLocator | null): WebLocator;
    webFind(type: By, value: string, { parent, timeout }?: LocatorOptions): Promise<WebLocator>;
    webFindFirstAvailable(selectors: readonly WebSelector[], { description, key, parent, timeout, }?: FirstAvailableOptions): Promise<[WebLocator, number]>;
    webFindFirstAvailableOnce(selectors: readonly WebSelector[], { description, key, parent, timeout, }?: FirstAvailableOptions): Promise<[WebLocator, number]>;
    private webFindFirstAvailableWithinBudget;
    private webFindOnce;
    webProbe(type: By, value: string, { parent, timeout }?: LocatorOptions): Promise<WebLocator | null>;
    webFindAll(type: By, value: string, { parent, timeout }?: LocatorOptions): Promise<WebElement[]>;
    private webFindAllOnce;
    private notFoundMessage;
}
export {};
