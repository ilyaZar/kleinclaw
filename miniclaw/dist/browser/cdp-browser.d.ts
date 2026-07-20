import { type ChildProcess } from "node:child_process";
import { CdpPage } from "./cdp-page.js";
import { type BrowserSessionPlan } from "./browser-session-plan.js";
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
    private readonly process;
    private readonly context;
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
