import { type Config } from "../model/config-model.js";
export declare const CHROME_136_VERSION = 136;
export type DiagnosticStatus = "ok" | "fail" | "info" | "warn";
export interface BrowserDiagnosticLine {
    status: DiagnosticStatus;
    message: string;
}
export interface BrowserDiagnosticReport {
    lines: BrowserDiagnosticLine[];
    remoteDebuggingPort: number | null;
    liveProbesSkipped: boolean;
}
export interface ChromeVersionProbeOptions {
    binaryPath: string | null;
    remoteHost: string;
    remotePort: number | null;
    remoteTimeout: number;
    binaryTimeout: number;
}
export declare class ChromeVersionInfo {
    readonly versionString: string;
    readonly majorVersion: number;
    readonly browserName: string;
    constructor(versionString: string, majorVersion: number, browserName?: string);
    get isChrome136Plus(): boolean;
    toString(): string;
}
export declare function parseVersionString(versionString: string): number;
export declare function normalizeBrowserName(browserName: string): string;
export declare function detectChromeVersionFromBinary(binaryPath: string, { timeout }?: {
    timeout?: number;
}): Promise<ChromeVersionInfo | null>;
export declare function detectChromeVersionFromRemoteDebugging({ host, port, timeout, }?: {
    host?: string;
    port?: number;
    timeout?: number;
}): Promise<ChromeVersionInfo | null>;
export declare function validateChrome136Configuration(browserArguments: string[], userDataDir: string | null | undefined): [boolean, string];
export declare function buildBrowserDiagnosticReport(config: Config): BrowserDiagnosticReport;
export declare function chromeVersionProbeOptionsFromConfig(config: Config): ChromeVersionProbeOptions;
export declare function getChromeVersionDiagnosticInfo({ binaryPath, remoteHost, remotePort, remoteTimeout, binaryTimeout, }?: {
    binaryPath?: string | null;
    remoteHost?: string;
    remotePort?: number | null;
    remoteTimeout?: number;
    binaryTimeout?: number;
}): Promise<Record<string, unknown>>;
export declare function getChromeVersionDiagnosticInfoFromConfig(config: Config): Promise<Record<string, unknown>>;
