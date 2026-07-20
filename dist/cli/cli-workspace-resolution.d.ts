import { type Workspace } from "../workspace.js";
import { type ParsedArgs } from "./cli-types.js";
export declare function resolveCommandWorkspace(parsed: ParsedArgs): Promise<Workspace | null>;
