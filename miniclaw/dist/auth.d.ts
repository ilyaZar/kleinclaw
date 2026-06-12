import { type LoginConfig } from "./model/config-model.js";
import { By, type WebLocator } from "./web-primitives.js";
export declare const LOGIN_DETECTION_SELECTORS: readonly [By, string][];
export declare const LOGGED_OUT_CTA_SELECTORS: readonly [By, string][];
export declare enum LoginDetectionReason {
    USER_INFO_MATCH = "USER_INFO_MATCH",
    CTA_MATCH = "CTA_MATCH",
    SELECTOR_TIMEOUT = "SELECTOR_TIMEOUT"
}
export declare class LoginDetectionResult {
    readonly isLoggedIn: boolean;
    readonly reason: LoginDetectionReason;
    constructor(isLoggedIn: boolean, reason: LoginDetectionReason);
}
export interface LoginController {
    readonly page?: {
        url?: string;
    };
    webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
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
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<[string, number]>;
}
export interface LoginDiagnosticsContext {
    basePrefix: string;
    error?: unknown;
    reason?: LoginDetectionReason;
}
export interface VerificationPromptContext {
    kind: "sms" | "email";
    message: string;
}
export interface LoginOptions {
    captchaDetectionTimeout?: number;
    captureDiagnostics?: (context: LoginDiagnosticsContext) => Promise<void> | void;
    emailVerificationTimeout?: number;
    loginDetectionTimeout?: number;
    onManualCaptcha?: () => Promise<void> | void;
    onVerificationPrompt?: (context: VerificationPromptContext) => Promise<void> | void;
    pageLoadTimeout?: number;
    pollIntervalMs?: number;
    quickDomTimeout?: number;
    rootUrl?: string;
    smsVerificationTimeout?: number;
}
export declare function currentPageUrl(controller: LoginController): string;
export declare function isValidPostAuth0Destination(url: string): boolean;
export declare function getLoginState(controller: LoginController, credentials: LoginConfig, { captureSelectorDiagnostics, ...options }?: LoginOptions & {
    captureSelectorDiagnostics?: boolean;
}): Promise<LoginDetectionResult>;
export declare function isLoggedIn(controller: LoginController, credentials: LoginConfig, options?: LoginOptions): Promise<boolean>;
export declare function waitForAuth0LoginContext(controller: LoginController, options?: LoginOptions): Promise<void>;
export declare function waitForAuth0PasswordStep(controller: LoginController, options?: LoginOptions): Promise<void>;
export declare function waitForPostAuth0SubmitTransition(controller: LoginController, credentials: LoginConfig, options?: LoginOptions): Promise<void>;
export declare function fillLoginDataAndSend(controller: LoginController, credentials: LoginConfig, options?: LoginOptions): Promise<void>;
export declare function clickGdprBanner(controller: LoginController, timeout: number): Promise<void>;
export declare function dismissConsentBanner(controller: LoginController, options?: LoginOptions): Promise<void>;
export declare function handleAfterLoginLogic(controller: LoginController, options?: LoginOptions): Promise<void>;
export declare function login(controller: LoginController, credentials: LoginConfig, options?: LoginOptions): Promise<LoginDetectionResult>;
