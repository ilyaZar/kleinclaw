import { type LoginController, type LoginOptions } from "./auth-types.js";
import { type LoginConfig } from "./model/browser-login-config.js";
export declare const AUTH0_SUBMIT_SELECTOR: string;
export declare function fillLoginDataAndSend(controller: LoginController, credentials: LoginConfig, options?: LoginOptions): Promise<void>;
