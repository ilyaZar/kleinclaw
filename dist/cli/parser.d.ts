import { type CommandPreparation, type ParsedArgs } from "./types.js";
export { NUMERIC_IDS_RE, isNumericIdSelector } from "../ad-selector.js";
export declare function parseArgs(argv: string[]): ParsedArgs;
export declare function isValidAdsSelector(selector: string, validKeywords: Set<string>): boolean;
export declare function prepareCommand(parsed: ParsedArgs): CommandPreparation;
