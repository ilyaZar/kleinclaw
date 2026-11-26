import { type LoginConfig } from "./model/browser-login-config.js";
import { type LoginController, type LoginDiagnosticsContext, LoginDetectionReason, type LoginOptions } from "./auth-types.js";
import { By } from "./web-primitives.js";
export declare const LOGIN_DETECTION_SELECTORS: readonly [By, string][];
export declare const LOGGED_OUT_CTA_SELECTORS: readonly [By, string][];
export declare class LoginDetectionResult {
    readonly isLoggedIn: boolean;
    readonly reason: LoginDetectionReason;
    constructor(isLoggedIn: boolean, reason: LoginDetectionReason);
}
export declare function currentPageUrl(controller: LoginController): string;
export declare function captureLoginDiagnostics(options: LoginOptions, context: LoginDiagnosticsContext): Promise<void>;
export declare function hasLoggedInMarker(controller: LoginController, credentials: LoginConfig, options: LoginOptions): Promise<boolean>;
export declare function getLoginState(controller: LoginController, credentials: LoginConfig, { captureSelectorDiagnostics, ...options }?: LoginOptions & {
    captureSelectorDiagnostics?: boolean;
}): Promise<LoginDetectionResult>;
