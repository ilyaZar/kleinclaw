import { type LoginController, type LoginOptions, type ResolvedLoginOptions } from "./auth-types.js";
export declare class ManualActionRequiredError extends Error {
    constructor(message: string);
}
export declare function waitForManualAction(controller: Pick<LoginController, "webSleep">, message: string, resolved: () => Promise<boolean>, { interactive, timeoutSeconds, }?: {
    interactive?: boolean;
    timeoutSeconds?: number;
}): Promise<void>;
export declare const CAPTCHA_PROMPT = "# Captcha present! Please solve the captcha.";
export declare function captchaResolved(controller: LoginController): Promise<boolean>;
export declare function waitForManualCaptcha(controller: LoginController, options: ResolvedLoginOptions, resolved?: () => Promise<boolean>): Promise<void>;
export declare function clickGdprBanner(controller: LoginController, timeout: number): Promise<void>;
export declare const SMS_VERIFICATION_XPATH: string;
export declare function handleAfterLoginLogic(controller: LoginController, options?: LoginOptions): Promise<void>;
