#!/usr/bin/env node
import { type RunOptions } from "./cli/types.js";
export { isValidAdsSelector, parseArgs, prepareCommand } from "./cli/parser.js";
export { planCommand } from "./cli/planning.js";
export type { CloseableSideEffectHandlers, Command, CommandPlan, CommandPreparation, CreateLiveSideEffects, ParsedArgs, PlannedAd, RunOptions, SideEffectCommandContext, SideEffectHandlers, } from "./cli/types.js";
export declare function run(argv?: string[], options?: RunOptions): Promise<number>;
