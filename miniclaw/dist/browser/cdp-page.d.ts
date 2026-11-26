import { CdpClient, type JsonTarget } from "./cdp-client.js";
import { type WebLocator, type WebPage } from "../web/types.js";
export declare class CdpPage implements WebPage {
    readonly endpoint: string;
    readonly target: JsonTarget;
    url: string;
    readonly client: CdpClient;
    constructor(endpoint: string, target: JsonTarget, timeoutMs: number);
    init(): Promise<void>;
    close(): Promise<void>;
    dispose(): Promise<void>;
    content(): Promise<string>;
    screenshot({ path: filePath }: {
        path: string;
    }): Promise<{
        path: string;
    }>;
    locator(selector: string): WebLocator;
    getByText(text: string): WebLocator;
    evaluate(pageFunction: string | ((arg: unknown) => unknown), arg?: unknown): Promise<unknown>;
    goto(url: string, options?: {
        timeout?: number;
        waitUntil?: "load" | "domcontentloaded";
    }): Promise<void>;
    waitForLoadState(state?: "load" | "domcontentloaded", options?: {
        timeout?: number;
    }): Promise<void>;
    waitForTimeout(ms: number): Promise<void>;
    private waitForNavigationCommit;
    private trackNavigationEvents;
    private refreshUrl;
}
