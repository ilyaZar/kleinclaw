import { type CdpClient } from "./cdp-client.js";
import { type WebElement, type WebLocator } from "../web/types.js";
type LocatorKind = "css" | "text" | "xpath";
interface LocatorStep {
    bestMatch?: boolean;
    index: number;
    kind: LocatorKind;
    value: string;
}
interface CdpLocatorPage {
    readonly client: Pick<CdpClient, "send">;
    evaluate(pageFunction: string | ((arg: unknown) => unknown), arg?: unknown): Promise<unknown>;
}
export declare function parseLocatorSelector(selector: string): Omit<LocatorStep, "index">;
export declare class CdpLocator implements WebLocator {
    private readonly page;
    private readonly steps;
    constructor(page: CdpLocatorPage, steps: readonly LocatorStep[]);
    first(): WebLocator;
    nth(index: number): WebLocator;
    locator(selector: string): WebLocator;
    all(): Promise<WebElement[]>;
    count(): Promise<number>;
    waitFor(options?: {
        state?: "attached" | "visible";
        timeout?: number;
    }): Promise<void>;
    click(): Promise<void>;
    fill(value: string): Promise<void>;
    press(key: string): Promise<void>;
    pressSequentially(value: string): Promise<void>;
    type(value: string): Promise<void>;
    sendFile(file: string): Promise<void>;
    setInputFiles(files: string | string[]): Promise<void>;
    textContent(): Promise<string | null>;
    inputValue(): Promise<string>;
    isChecked(): Promise<boolean>;
    isDisabled(): Promise<boolean>;
    isEditable(): Promise<boolean>;
    isEnabled(): Promise<boolean>;
    isVisible(): Promise<boolean>;
    getAttribute(name: string): Promise<string | null>;
    evaluate<T = unknown>(pageFunction: string | ((element: unknown) => T)): Promise<T>;
    private resolveObjectId;
    private resolveElementHandle;
}
export {};
