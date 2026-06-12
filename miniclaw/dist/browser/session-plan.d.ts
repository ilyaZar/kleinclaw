import { BrowserConfig, type Config } from "../model/config-model.js";
export declare const DEFAULT_BROWSER_ARGS: readonly ["--disable-crash-reporter", "--disable-domain-reliability", "--disable-sync", "--no-experiments", "--disable-search-engine-choice-screen", "--disable-features=MediaRouter", "--use-mock-keychain", "--test-type", string];
export interface BrowserSessionPlanOptions {
    defaultUserDataDir?: string | null;
    debugLogging?: boolean;
    homeDir?: string;
    cwd?: string;
}
export interface BrowserCandidateOptions {
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    platform?: NodeJS.Platform;
    searchPath?: string;
}
export interface BrowserSessionPlan {
    mode: "connect" | "launch";
    browserExecutablePath: string;
    remoteHost: string;
    remotePort: number | null;
    browserArgs: string[];
    userDataDir: string | null;
    profileDir: string | null;
    preferencesFile: string | null;
    extensionPaths: string[];
    sandbox: boolean;
    environment: Record<string, string>;
    warnings: string[];
}
export declare function browserCandidatePaths({ env, homeDir, platform, searchPath, }?: BrowserCandidateOptions): Array<string | null>;
export declare function getCompatibleBrowser(options?: BrowserCandidateOptions): string;
export declare function buildInitialPrefs(): Record<string, unknown>;
export declare function writeInitialPrefs(prefsFile: string): void;
export declare function hasNonEmptyUserDataDirArg(args: Iterable<string>): boolean;
export declare function resolveUserDataDirPaths(argValue: string, configValue: string, { cwd, homeDir, }?: {
    cwd?: string;
    homeDir?: string;
}): [string, string];
export declare function buildBrowserSessionPlan(configOrBrowserConfig: Config | BrowserConfig, { defaultUserDataDir, debugLogging, homeDir, cwd, }?: BrowserSessionPlanOptions): BrowserSessionPlan;
