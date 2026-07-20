import { type ParsedArgs } from "./cli-types.js";
export declare function createDefaultConfig(configPath: string): Promise<number>;
export declare function verifyConfig(parsed: ParsedArgs): Promise<number>;
export declare function updateContentHashes(parsed: ParsedArgs): Promise<number>;
export declare function runDiagnose(parsed: ParsedArgs): Promise<number>;
