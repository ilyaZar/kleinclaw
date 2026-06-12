import { type BrowserSessionPlan } from "./browser.js";
import { BrowserConfig, Config } from "./model/config-model.js";
export interface BrowserSessionPage {
    close?: () => Promise<void>;
}
export interface BrowserSessionContext {
    pages(): BrowserSessionPage[];
    newPage(): Promise<BrowserSessionPage>;
    close(): Promise<void>;
    browser?(): BrowserSessionBrowser | null;
}
export interface BrowserSessionBrowser {
    contexts(): BrowserSessionContext[];
    close(): Promise<void>;
}
export interface BrowserSessionDriver {
    connectCdpBrowser(endpointURL: string, options?: {
        timeout?: number;
    }): Promise<BrowserSessionBrowser>;
    launchBrowser(plan: BrowserSessionPlan, options?: {
        timeout?: number;
    }): Promise<BrowserSessionContext>;
}
export interface CreateBrowserSessionOptions {
    allowLiveBrowser?: boolean;
    cwd?: string;
    defaultUserDataDir?: string | null;
    driver?: BrowserSessionDriver;
    timeout?: number;
    ensureProfilePrefs?: boolean;
}
export interface BrowserSession {
    mode: BrowserSessionPlan["mode"];
    browser: BrowserSessionBrowser | null;
    context: BrowserSessionContext;
    page: BrowserSessionPage;
    plan: BrowserSessionPlan;
    close(): Promise<void>;
}
export declare class LiveBrowserSessionDisabledError extends Error {
    constructor();
}
export declare function browserSessionPlanFrom(source: Config | BrowserConfig | BrowserSessionPlan): BrowserSessionPlan;
export declare function createBrowserSession(source: Config | BrowserConfig | BrowserSessionPlan, { allowLiveBrowser, cwd, defaultUserDataDir, driver, timeout, ensureProfilePrefs: shouldEnsureProfilePrefs, }?: CreateBrowserSessionOptions): Promise<BrowserSession>;
export declare function preferencesFileForSession(plan: BrowserSessionPlan): string | null;
