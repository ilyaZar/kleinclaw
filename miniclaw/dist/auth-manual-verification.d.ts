import { type LoginController, type LoginOptions } from "./auth-types.js";
export declare class ManualActionRequiredError extends Error {
    constructor(message: string);
}
export declare function defaultManualCaptchaPrompt(): Promise<void>;
export declare function clickGdprBanner(controller: LoginController, timeout: number): Promise<void>;
export declare function handleAfterLoginLogic(controller: LoginController, options?: LoginOptions): Promise<void>;
