import { type CommandPlan, type ParsedArgs } from "./cli-types.js";
export declare function planCommand(parsed: ParsedArgs, { now }?: {
    now?: Date;
}): Promise<CommandPlan>;
