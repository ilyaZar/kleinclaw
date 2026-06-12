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
    connectOverCDP(endpointURL: string, options?: {
        timeout?: number;
    }): Promise<BrowserSessionBrowser>;
    launchPersistentContext(userDataDir: string, options?: {
        acceptDownloads?: boolean;
        args?: string[];
        chromiumSandbox?: boolean;
        env?: Record<string, string | undefined>;
        executablePath?: string;
        headless?: boolean;
        timeout?: number;
    }): Promise<BrowserSessionContext>;
}
export interface CreateBrowserSessionOptions {
    allowLiveBrowser?: boolean;
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
export declare function createBrowserSession(source: Config | BrowserConfig | BrowserSessionPlan, { allowLiveBrowser, driver, timeout, ensureProfilePrefs: shouldEnsureProfilePrefs, }?: CreateBrowserSessionOptions): Promise<BrowserSession>;
export declare function preferencesFileForSession(plan: BrowserSessionPlan): string | null;
