import { fillLoginDataAndSend } from "./auth-auth0-flow.js";
import { getLoginState, type LoginDetectionResult } from "./auth-login-state.js";
import { ManualActionRequiredError } from "./auth-manual-verification.js";
import { IP_RANGE_BLOCK_MESSAGE, IpRangeBlockedError } from "./auth-network-gate.js";
import { type LoginController, type LoginDiagnosticsContext, LoginDetectionReason, type LoginOptions, type VerificationPromptContext } from "./auth-types.js";
import { type LoginConfig } from "./model/browser-login-config.js";
export { fillLoginDataAndSend, getLoginState, IP_RANGE_BLOCK_MESSAGE, IpRangeBlockedError, LoginDetectionReason, ManualActionRequiredError, };
export { type LoginController, type LoginDetectionResult, type LoginDiagnosticsContext, type LoginOptions, type VerificationPromptContext, };
export declare function login(controller: LoginController, credentials: LoginConfig, options?: LoginOptions): Promise<LoginDetectionResult>;
