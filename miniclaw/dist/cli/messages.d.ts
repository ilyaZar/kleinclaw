import { type Command, type CommandPlan } from "./types.js";
export declare function noAdsMessage(command: Command | string): string | null;
export declare function printDoneBlock(message: string): void;
export declare function printDiagnosticLine(status: string, message: string): void;
export declare function browserCommandMessage(plan: CommandPlan): string;
export declare function sideEffectDoneMessage(command: Command | string, succeeded: number, failed: number): string;
export declare function deleteDoneMessage(deleted: number, processed: number): string;
export declare function extendDoneMessage(extended: number, attempted: number): string;
export declare function downloadDoneMessage(selector: string, downloaded: number, targetCount: number): string;
