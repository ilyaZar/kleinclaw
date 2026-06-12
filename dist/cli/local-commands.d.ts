import { type Workspace } from "../workspace.js";
import { type ParsedArgs } from "./types.js";
export declare function createDefaultConfig(configPath: string): Promise<number>;
export declare function verifyConfig(parsed: ParsedArgs): Promise<number>;
export declare function updateContentHashes(parsed: ParsedArgs): Promise<number>;
export declare function runUpdateCheck(parsed: ParsedArgs, workspace: Workspace): Promise<number>;
export declare function runDiagnose(parsed: ParsedArgs): Promise<number>;
