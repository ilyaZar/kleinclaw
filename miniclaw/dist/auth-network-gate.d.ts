import { type LoginController } from "./auth-types.js";
export declare const IP_RANGE_BLOCK_MESSAGE = "Kleinanzeigen temporarily blocked this network or IP range.";
export declare class IpRangeBlockedError extends Error {
    constructor();
}
export declare function assertIpRangeAvailable(controller: LoginController): Promise<void>;
