import { type TimeoutConfig, type TimeoutKey } from "../model/timeout-config.js";
import { type WebControllerOptions, type WebPage } from "./types.js";
export declare class ControllerTiming {
    readonly page: WebPage;
    readonly defaultTimeout: number;
    protected readonly timeSource: () => number;
    protected readonly sleeper: (ms: number) => Promise<void>;
    protected readonly timeoutConfig: TimeoutConfig | null;
    private readonly timingCollector;
    private readonly defaultTimeoutOverride;
    private readonly sleepRangeMs;
    private readonly randomInt;
    constructor(page: WebPage, options?: WebControllerOptions);
    webAwait<T>(condition: () => T | Promise<T>, { timeout, timeoutErrorMessage, applyMultiplier, }?: {
        timeout?: number | null;
        timeoutErrorMessage?: string;
        applyMultiplier?: boolean;
    }): Promise<T>;
    webSleep(minMs?: number, maxMs?: number): Promise<void>;
    protected withTimeout<T>(operation: Promise<T>, timeout: number, timeoutErrorMessage: string): Promise<T>;
    protected baseTimeout(key: TimeoutKey, override?: number | null): number;
    protected effectiveTimeout(key: TimeoutKey, override?: number | null, attempt?: number): number;
    protected recordTiming(key: TimeoutKey, description: string, configuredTimeout: number, effectiveTimeout: number, actualDuration: number, attemptIndex: number, success: boolean): void;
    protected runWithTimeoutRetries<T>(operation: (timeout: number) => Promise<T>, { description, key, timeout, }: {
        description: string;
        key: TimeoutKey;
        timeout?: number | null;
    }): Promise<T>;
}
