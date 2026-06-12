import { type Workspace } from "../workspace.js";
import { type CreateLiveSideEffects, type ParsedArgs, type SideEffectHandlers } from "./types.js";
export declare function runSideEffectCommand(parsed: ParsedArgs, sideEffects?: SideEffectHandlers, createLiveSideEffects?: CreateLiveSideEffects, workspace?: Workspace | null): Promise<number>;
