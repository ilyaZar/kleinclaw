import { type ChildProcess } from "node:child_process";
import { type WebElement, type WebLocator, type WebPage } from "../web/types.js";
import { type BrowserSessionPlan } from "./session-plan.js";
interface JsonTarget {
    id?: string;
    type?: string;
    url?: string;
    webSocketDebuggerUrl?: string;
}
interface CdpRemoteObject {
    objectId?: string;
    subtype?: string;
    type?: string;
    unserializableValue?: string;
    value?: unknown;
}
interface CdpCommandResult {
    result?: CdpRemoteObject;
    exceptionDetails?: {
        text?: string;
        exception?: {
            description?: string;
            value?: unknown;
        };
    };
    [key: string]: unknown;
}
type CdpEventHandler = (params: Record<string, unknown>) => void;
type LocatorKind = "css" | "text" | "xpath";
interface LocatorStep {
    bestMatch?: boolean;
    index: number;
    kind: LocatorKind;
    value: string;
}
export declare class CdpClient {
    private readonly webSocketUrl;
    private readonly defaultTimeoutMs;
    private nextId;
    private socket;
    private readonly eventHandlers;
    private readonly pending;
    constructor(webSocketUrl: string, defaultTimeoutMs?: number);
    connect(): Promise<void>;
    close(): void;
    on(method: string, handler: CdpEventHandler): () => void;
    send(method: string, params?: Record<string, unknown>, { timeoutMs }?: {
        timeoutMs?: number;
    }): Promise<CdpCommandResult>;
    private handleMessage;
    private rejectAll;
}
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
export declare class CdpLocator implements WebLocator {
    private readonly page;
    private readonly steps;
    constructor(page: CdpPage, steps: readonly LocatorStep[]);
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
export declare class CdpContext {
    private readonly endpoint;
    private readonly timeoutMs;
    private readonly owner;
    private readonly initialPages;
    private readonly openedPages;
    constructor(endpoint: string, timeoutMs: number, owner?: CdpBrowser | null, initialPages?: CdpPage[]);
    browser(): CdpBrowser | null;
    pages(): CdpPage[];
    newPage(): Promise<CdpPage>;
    close(): Promise<void>;
}
export declare class CdpBrowser {
    private readonly endpoint;
    private readonly timeoutMs;
    private readonly process;
    private readonly context;
    private readonly browserClient;
    constructor(endpoint: string, timeoutMs: number, process?: ChildProcess | null, initialPages?: CdpPage[]);
    contexts(): CdpContext[];
    close(): Promise<void>;
}
export declare function connectCdpBrowser(endpoint: string, { timeoutMs }?: {
    timeoutMs?: number;
}): Promise<CdpBrowser>;
export declare function launchCdpBrowser(plan: BrowserSessionPlan, { timeoutMs }?: {
    timeoutMs?: number;
}): Promise<CdpContext>;
export {};
