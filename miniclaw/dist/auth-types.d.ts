import { type TimeoutKey } from "./model/timeout-config.js";
import { type By, type WebLocator } from "./web-primitives.js";
import { type WebSelector } from "./web/selector.js";
export interface LoginController {
    readonly page?: {
        url?: string;
    };
    webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
    webExecute(jscode: string): Promise<unknown>;
    webInput(type: By, value: string, text: string, timeout?: number): Promise<WebLocator>;
    webOpen(url: string, options?: {
        timeout?: number;
        reloadIfAlreadyOpen?: boolean;
    }): Promise<void>;
    webProbe(type: By, value: string, options?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<WebLocator | null>;
    webSleep(minMs?: number, maxMs?: number): Promise<void>;
    webText(type: By, value: string, options?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<string>;
    webTextFirstAvailable?(selectors: readonly [By, string][], options?: {
        fallbackToTextContent?: boolean;
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<[string, number]>;
    webTextFirstAvailableOnce?(selectors: readonly WebSelector[], options?: {
        fallbackToTextContent?: boolean;
        parent?: WebLocator | null;
        key?: TimeoutKey;
        timeout?: number;
    }): Promise<[string, number]>;
}
export interface LoginDiagnosticsContext {
    basePrefix: string;
    error?: unknown;
    reason?: LoginDetectionReason;
}
export declare const DEFAULT_MANUAL_ACTION_TIMEOUT = 300;
export interface VerificationPromptContext {
    kind: "sms" | "email";
    message: string;
}
export declare enum LoginDetectionReason {
    USER_INFO_MATCH = "USER_INFO_MATCH",
    CTA_MATCH = "CTA_MATCH",
    SELECTOR_TIMEOUT = "SELECTOR_TIMEOUT"
}
export interface LoginOptions {
    captchaDetectionTimeout?: number;
    captureDiagnostics?: (context: LoginDiagnosticsContext) => Promise<void> | void;
    emailVerificationTimeout?: number;
    loginDetectionTimeout?: number;
    manualActionTimeout?: number;
    onManualCaptcha?: () => Promise<void> | void;
    onVerificationPrompt?: (context: VerificationPromptContext) => Promise<void> | void;
    pageLoadTimeout?: number;
    pollIntervalMs?: number;
    quickDomTimeout?: number;
    rootUrl?: string;
    smsVerificationTimeout?: number;
}
export type ResolvedLoginOptions = Required<Pick<LoginOptions, "captchaDetectionTimeout" | "emailVerificationTimeout" | "loginDetectionTimeout" | "manualActionTimeout" | "pageLoadTimeout" | "pollIntervalMs" | "quickDomTimeout" | "rootUrl" | "smsVerificationTimeout">> & LoginOptions;
export declare function resolveLoginOptions(options: LoginOptions): ResolvedLoginOptions;
export declare function isTimeoutLike(error: unknown): boolean;
