import path from "node:path";
import { APP_NAME, ensureDirectory, resolveWorkspace, } from "../workspace.js";
function commandNeedsWorkspace(command) {
    return !["help", "version", "create-config"].includes(command);
}
export async function resolveCommandWorkspace(parsed) {
    if (!commandNeedsWorkspace(parsed.command)) {
        return null;
    }
    const workspace = resolveWorkspace({
        configArg: parsed.configArg,
        logfileArg: parsed.logfileArg,
        workspaceMode: parsed.workspaceMode,
        logfileExplicitlyProvided: parsed.logfileExplicitlyProvided,
        logBasename: APP_NAME,
        stdinIsTTY: process.stdin.isTTY,
    });
    await ensureDirectory(path.dirname(workspace.configFile), "config directory");
    parsed.configPath = workspace.configFile;
    parsed.logfilePath = workspace.logFile;
    return workspace;
}
