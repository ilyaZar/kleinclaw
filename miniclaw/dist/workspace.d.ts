export declare const APP_NAME = "miniclaw";
export type InstallationMode = "portable" | "xdg";
export type PathCategory = "config" | "cache" | "state";
export interface Workspace {
    mode: InstallationMode;
    configFile: string;
    configDir: string;
    logFile: string | null;
    stateDir: string;
    downloadDir: string;
    browserProfileDir: string;
    diagnosticsDir: string;
}
export interface WorkspaceResolutionOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    stdinIsTTY?: boolean;
}
export interface ResolveWorkspaceArgs extends WorkspaceResolutionOptions {
    configArg: string | null;
    logfileArg: string | null;
    workspaceMode: InstallationMode | null;
    logfileExplicitlyProvided: boolean;
    logBasename: string;
}
export declare function workspaceForConfig(configFile: string, logBasename?: string): Workspace;
export declare function ensureDirectory(directory: string, description: string): Promise<void>;
export declare function getXdgBaseDir(category: PathCategory, options?: WorkspaceResolutionOptions): string;
export declare function detectInstallationMode(options?: WorkspaceResolutionOptions): InstallationMode | null;
export declare function resolveWorkspace(args: ResolveWorkspaceArgs): Workspace;
