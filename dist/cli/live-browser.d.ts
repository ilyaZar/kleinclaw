import { type Workspace } from "../workspace.js";
import { type CreateLiveSideEffects, type ParsedArgs } from "./types.js";
export declare function runLiveBrowserCommand(parsed: ParsedArgs, createLiveSideEffects?: CreateLiveSideEffects, workspace?: Workspace | null): Promise<number>;
