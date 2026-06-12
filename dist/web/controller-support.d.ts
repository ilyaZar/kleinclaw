import { type WebResponse } from "./types.js";
export declare function requirePageMethod<T>(method: T | undefined, name: string): T;
export declare function validCodes(validResponseCodes: number | Iterable<number>): Set<number>;
export declare function ensureStatusCode(response: unknown): asserts response is WebResponse;
