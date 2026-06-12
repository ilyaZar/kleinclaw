/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
export const APP_NAME = "miniclaw";
function runtimeCwd(options = {}) {
    return path.resolve(options.cwd ?? process.cwd());
}
function runtimeEnv(options = {}) {
    return options.env ?? process.env;
}
function runtimeHome(options = {}) {
    return path.resolve(options.homeDir ?? os.homedir());
}
function resolveFromCwd(value, options = {}) {
    return path.resolve(runtimeCwd(options), value);
}
function isRelativeTo(candidate, parent) {
    const relative = path.relative(parent, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function exists(filePath) {
    return fs.existsSync(filePath);
}
function dedupe(values) {
    return [...new Set(values)];
}
export function workspaceForConfig(configFile, logBasename = APP_NAME) {
    const resolvedConfig = path.resolve(configFile);
    const configDir = path.dirname(resolvedConfig);
    const stateDir = path.join(configDir, ".temp");
    return {
        mode: "portable",
        configFile: resolvedConfig,
        configDir,
        logFile: path.join(configDir, `${logBasename}.log`),
        stateDir,
        downloadDir: path.join(configDir, "downloaded-ads"),
        browserProfileDir: path.join(stateDir, "browser-profile"),
        diagnosticsDir: path.join(stateDir, "diagnostics"),
    };
}
export async function ensureDirectory(directory, description) {
    await fsp.mkdir(directory, { recursive: true });
    const stat = await fsp.stat(directory);
    if (!stat.isDirectory()) {
        throw new Error(`${description} is not a directory: ${directory}`);
    }
}
export function getXdgBaseDir(category, options = {}) {
    const env = runtimeEnv(options);
    const home = runtimeHome(options);
    let base;
    switch (category) {
        case "config":
            base = env.XDG_CONFIG_HOME || path.join(home, ".config");
            break;
        case "cache":
            base = env.XDG_CACHE_HOME || path.join(home, ".cache");
            break;
        case "state":
            base = env.XDG_STATE_HOME || path.join(home, ".local", "state");
            break;
    }
    return path.resolve(base, APP_NAME);
}
function buildXdgWorkspace(logBasename, configFileOverride, options = {}) {
    const configDir = getXdgBaseDir("config", options);
    const cacheDir = getXdgBaseDir("cache", options);
    const stateDir = getXdgBaseDir("state", options);
    const configFile = configFileOverride
        ? path.resolve(configFileOverride)
        : path.join(configDir, "config.yaml");
    return {
        mode: "xdg",
        configFile,
        configDir,
        logFile: path.join(stateDir, `${logBasename}.log`),
        stateDir,
        downloadDir: path.join(configDir, "downloaded-ads"),
        browserProfileDir: path.join(cacheDir, "browser-profile"),
        diagnosticsDir: path.join(cacheDir, "diagnostics"),
    };
}
export function detectInstallationMode(options = {}) {
    const portableConfig = path.join(runtimeCwd(options), "config.yaml");
    if (exists(portableConfig)) {
        return "portable";
    }
    const xdgConfig = path.join(getXdgBaseDir("config", options), "config.yaml");
    if (exists(xdgConfig)) {
        return "xdg";
    }
    return null;
}
function detectModeFromFootprintsWithHits(configFile, options = {}) {
    const resolvedConfig = path.resolve(configFile);
    const cwdConfig = path.join(runtimeCwd(options), "config.yaml");
    const xdgConfigDir = getXdgBaseDir("config", options);
    const xdgCacheDir = getXdgBaseDir("cache", options);
    const xdgStateDir = getXdgBaseDir("state", options);
    const configInXdgTree = isRelativeTo(resolvedConfig, xdgConfigDir);
    const portableHits = [];
    const xdgHits = [];
    if (resolvedConfig === cwdConfig) {
        portableHits.push(cwdConfig);
    }
    if (!configInXdgTree) {
        const portableStateDir = path.join(path.dirname(resolvedConfig), ".temp");
        const portableDownloadDir = path.join(path.dirname(resolvedConfig), "downloaded-ads");
        if (exists(portableStateDir)) {
            portableHits.push(portableStateDir);
        }
        if (exists(portableDownloadDir)) {
            portableHits.push(portableDownloadDir);
        }
    }
    if (configInXdgTree) {
        xdgHits.push(resolvedConfig);
    }
    if (!configInXdgTree && exists(path.join(xdgConfigDir, "config.yaml"))) {
        xdgHits.push(path.join(xdgConfigDir, "config.yaml"));
    }
    if (exists(path.join(xdgConfigDir, "downloaded-ads"))) {
        xdgHits.push(path.join(xdgConfigDir, "downloaded-ads"));
    }
    if (exists(path.join(xdgCacheDir, "browser-profile"))) {
        xdgHits.push(path.join(xdgCacheDir, "browser-profile"));
    }
    if (exists(path.join(xdgCacheDir, "diagnostics"))) {
        xdgHits.push(path.join(xdgCacheDir, "diagnostics"));
    }
    if (exists(path.join(xdgStateDir, "update_check_state.json"))) {
        xdgHits.push(path.join(xdgStateDir, "update_check_state.json"));
    }
    const portableDetected = portableHits.length > 0;
    const xdgDetected = xdgHits.length > 0;
    if (portableDetected && xdgDetected) {
        return { mode: "ambiguous", portableHits, xdgHits };
    }
    if (portableDetected) {
        return { mode: "portable", portableHits, xdgHits };
    }
    if (xdgDetected) {
        return { mode: "xdg", portableHits, xdgHits };
    }
    return { mode: "unknown", portableHits, xdgHits };
}
function formatHits(label, hits) {
    if (!hits.length) {
        return `${label}: none`;
    }
    return `${label}:\n- ${dedupe(hits).join("\n- ")}`;
}
function workspaceModeResolutionError(configFile, detectedMode, portableHits, xdgHits) {
    const guidance = `Cannot determine workspace mode for --config=${configFile}. ` +
        "Use --workspace-mode=portable or --workspace-mode=xdg. " +
        "Portable workspaces keep config, state, downloads, diagnostics, and " +
        "browser profile data beside config.yaml; XDG workspaces use the " +
        "platform config, cache, and state directories.";
    const details = [
        formatHits("Portable footprint hits", portableHits),
        formatHits("XDG footprint hits", xdgHits),
    ].join("\n");
    const reason = detectedMode === "ambiguous"
        ? "Detected both portable and XDG footprints."
        : "Detected neither portable nor XDG footprints.";
    return new Error(`${guidance}\n${reason}\n${details}`);
}
function promptInstallationMode(options = {}) {
    if (options.stdinIsTTY === false || !process.stdin.isTTY) {
        return "portable";
    }
    return "portable";
}
export function resolveWorkspace(args) {
    const options = {
        cwd: args.cwd,
        env: args.env,
        homeDir: args.homeDir,
        stdinIsTTY: args.stdinIsTTY,
    };
    const configPath = args.configArg
        ? resolveFromCwd(args.configArg, options)
        : null;
    let mode = args.workspaceMode;
    if (configPath && mode === null) {
        const detected = detectModeFromFootprintsWithHits(configPath, options);
        if (detected.mode === "portable" || detected.mode === "xdg") {
            mode = detected.mode;
        }
        else {
            throw workspaceModeResolutionError(configPath, detected.mode, detected.portableHits, detected.xdgHits);
        }
    }
    let workspace;
    if (args.configArg) {
        if (!configPath || mode === null) {
            throw new Error("Workspace mode and config path must be resolved");
        }
        workspace = mode === "portable"
            ? workspaceForConfig(configPath, args.logBasename)
            : buildXdgWorkspace(args.logBasename, configPath, options);
    }
    else {
        mode = mode ?? detectInstallationMode(options) ?? promptInstallationMode(options);
        workspace = mode === "portable"
            ? workspaceForConfig(path.join(runtimeCwd(options), "config.yaml"), args.logBasename)
            : buildXdgWorkspace(args.logBasename, null, options);
    }
    if (args.logfileExplicitlyProvided) {
        workspace = {
            ...workspace,
            logFile: args.logfileArg ? resolveFromCwd(args.logfileArg, options) : null,
        };
    }
    return workspace;
}
