import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeOptionalString } from "./input.js";
import { buildChildEnv, runProcess } from "./process-boundary.js";
const AUTO_BROWSER_ORDER = [
    "chromium",
    "chromium-browser",
    "google-chrome",
    "microsoft-edge",
];
const BROWSER_CHOICES = Object.freeze({
    chromium: {
        label: "Chromium",
        commands: ["chromium", "chromium-browser"],
        profileDir: [".config", "chromium"],
        supportedByMiniclaw: true,
    },
    brave: {
        label: "Brave",
        commands: ["brave", "brave-browser"],
        profileDir: [".config", "BraveSoftware", "Brave-Browser"],
        supportedByMiniclaw: false,
        supportNote: "not documented or auto-detected by miniclaw",
    },
    "google-chrome": {
        label: "Google Chrome",
        commands: ["google-chrome", "google-chrome-stable"],
        profileDir: [".config", "google-chrome"],
        supportedByMiniclaw: true,
    },
    "microsoft-edge": {
        label: "Microsoft Edge",
        commands: ["microsoft-edge", "microsoft-edge-stable"],
        profileDir: [".config", "microsoft-edge"],
        supportedByMiniclaw: true,
    },
});
const SUPPORTED_BROWSER_IDS = Object.freeze(Object.entries(BROWSER_CHOICES)
    .filter(([, choice]) => choice.supportedByMiniclaw)
    .map(([id]) => id));
function normalizeBrowser(value) {
    const browser = normalizeOptionalString(value);
    if (browser === undefined)
        return undefined;
    if (browser !== "auto" && !SUPPORTED_BROWSER_IDS.includes(browser)) {
        throw new Error(`browser must be one of: auto, ${SUPPORTED_BROWSER_IDS.join(", ")}`);
    }
    return browser;
}
function normalizeBoolean(value, name) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "boolean") {
        throw new Error(`${name} must be a boolean`);
    }
    return value;
}
function normalizePath(value, name) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string") {
        throw new Error(`${name} must be a string`);
    }
    return value.trim();
}
function normalizeProfileMode(value) {
    const mode = normalizeOptionalString(value);
    if (mode === undefined)
        return undefined;
    if (!["workspace", "system-default", "custom"].includes(mode)) {
        throw new Error("profileMode must be workspace, system-default, or custom");
    }
    return mode;
}
export function assertSafeBrowserConfigureParams(params = {}) {
    const forbidden = [
        "binaryLocation",
        "allowUnsupportedBrowser",
        "userDataDir",
    ].filter((key) => params[key] !== undefined);
    if (forbidden.length > 0) {
        throw new Error(`${forbidden.join(", ")} cannot be changed through browser_configure; ` +
            "edit the local miniclaw config outside OpenClaw");
    }
    if (params.profileMode === "custom") {
        throw new Error("profileMode custom cannot be persisted through browser_configure; " +
            "edit the local miniclaw config outside OpenClaw");
    }
    if (params.profileName !== undefined &&
        params.profileMode !== "system-default") {
        throw new Error("profileName requires profileMode system-default");
    }
}
function browserSearchPaths(sourceEnv) {
    return [...new Set([
            ...(sourceEnv.PATH ? sourceEnv.PATH.split(path.delimiter) : []),
            "/usr/local/bin", "/usr/bin", "/bin", "/opt/brave-bin",
        ].filter(Boolean))];
}
async function fileIsExecutable(filePath) {
    try {
        await fs.access(filePath, fsConstants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function findExecutable(command, sourceEnv) {
    if (path.isAbsolute(command) || command.includes(path.sep)) {
        const resolved = path.resolve(command);
        return (await fileIsExecutable(resolved)) ? resolved : null;
    }
    for (const directory of browserSearchPaths(sourceEnv)) {
        const candidate = path.join(directory, command);
        if (await fileIsExecutable(candidate)) {
            return candidate;
        }
    }
    return null;
}
async function resolveBrowserChoice(browser, sourceEnv = process.env) {
    const choice = BROWSER_CHOICES[browser];
    if (!choice) {
        return null;
    }
    for (const command of choice.commands) {
        const executable = await findExecutable(command, sourceEnv);
        if (executable) {
            return executable;
        }
    }
    return null;
}
function inferBrowser(executable) {
    const value = String(executable ?? "");
    const command = path.basename(value).toLowerCase().replace(/\.exe$/, "");
    const alias = Object.entries(BROWSER_CHOICES).find(([, choice]) => choice.commands.includes(command));
    if (alias) {
        return alias[0];
    }
    const lower = value.toLowerCase();
    if (lower.includes("brave"))
        return "brave";
    if (lower.includes("chromium"))
        return "chromium";
    if (lower.includes("chrome"))
        return "google-chrome";
    if (lower.includes("edge") || lower.includes("msedge")) {
        return "microsoft-edge";
    }
    return null;
}
async function browserVersion(executable, commandRunner) {
    const result = await runProcess(executable, ["--version"], {
        timeoutMs: 4000, maxBufferChars: 500, env: buildChildEnv(), commandRunner,
    });
    return [result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n")
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? "";
}
export async function detectInstalledBrowsers({ sourceEnv = process.env, commandRunner } = {}) {
    const detected = [];
    for (const [id, choice] of Object.entries(BROWSER_CHOICES)) {
        const executable = await resolveBrowserChoice(id, sourceEnv);
        detected.push({
            id,
            label: choice.label,
            commands: choice.commands,
            installed: Boolean(executable),
            executable,
            version: executable ? await browserVersion(executable, commandRunner) : "",
            supportedByMiniclaw: choice.supportedByMiniclaw,
            supportNote: choice.supportNote ?? "",
            miniclawAutoDefault: choice.commands.some((command) => AUTO_BROWSER_ORDER.includes(command)),
        });
    }
    return detected;
}
function effectiveAutoBrowser(detectedBrowsers) {
    for (const command of AUTO_BROWSER_ORDER) {
        const browser = detectedBrowsers.find((entry) => entry.commands.includes(command));
        if (browser?.installed) {
            return browser;
        }
    }
    return null;
}
function displayProfilePath(filePath, baseDir, allowWorkspaceProfile = false) {
    if (!filePath) {
        return "";
    }
    if (allowWorkspaceProfile) {
        const workspaceProfile = path.join(baseDir, ".temp", "browser-profile");
        if (path.resolve(baseDir, filePath) === workspaceProfile) {
            const resolved = path.resolve(baseDir, filePath);
            const relative = path.relative(baseDir, resolved);
            if (relative === "" ||
                (!relative.startsWith("..") && !path.isAbsolute(relative))) {
                return relative || ".";
            }
            return `[redacted-path]/${path.basename(resolved)}`;
        }
    }
    return "[configured-profile-dir]";
}
function redactBrowserArgument(argument, baseDir) {
    const match = /^--user-data-dir=(.*)$/.exec(argument);
    if (!match) {
        return argument;
    }
    return `--user-data-dir=${displayProfilePath(match[1].replace(/^["']|["']$/g, ""), baseDir)}`;
}
export function buildBrowserStatusPayload({ cliConfig, browserConfig, detectedBrowsers }) {
    const autoBrowser = effectiveAutoBrowser(detectedBrowsers);
    const configuredBinary = browserConfig.binary_location;
    const configuredBrowser = configuredBinary
        ? inferBrowser(configuredBinary)
        : "auto";
    const effectiveBrowser = configuredBinary
        ? detectedBrowsers.find((entry) => entry.id === configuredBrowser) ?? {
            id: configuredBrowser,
            executable: configuredBinary,
        }
        : autoBrowser;
    const workspaceProfile = !browserConfig.user_data_dir && cliConfig.workspaceMode === "portable"
        ? path.join(cliConfig.cwd, ".temp", "browser-profile")
        : "";
    const profileName = browserConfig.profile_name ? "[configured-profile]" : "";
    return {
        ok: true,
        operation: "browser_status",
        configFile: { configured: true, exists: true, isFile: true },
        browser: {
            supportedChoices: ["auto", ...SUPPORTED_BROWSER_IDS],
            configured: {
                browser: configuredBrowser,
                binaryLocation: configuredBinary,
                usePrivateWindow: browserConfig.use_private_window,
                userDataDir: displayProfilePath(browserConfig.user_data_dir, cliConfig.cwd),
                userDataDirConfigured: Boolean(browserConfig.user_data_dir),
                profileName,
                profileNameConfigured: Boolean(browserConfig.profile_name),
                arguments: browserConfig.arguments.map((entry) => redactBrowserArgument(entry, cliConfig.cwd)),
            },
            effective: {
                browser: effectiveBrowser?.id ?? null,
                binaryLocation: configuredBinary || autoBrowser?.executable || "",
                usePrivateWindow: browserConfig.use_private_window,
                userDataDir: displayProfilePath(browserConfig.user_data_dir || workspaceProfile, cliConfig.cwd, !browserConfig.user_data_dir),
                userDataDirConfigured: Boolean(browserConfig.user_data_dir),
                profileName: profileName || "Default",
                profileNameConfigured: Boolean(browserConfig.profile_name),
            },
            notes: configuredBinary
                ? []
                : [
                    "auto detection follows miniclaw order",
                    "Brave is detected as a custom Chromium-family browser, not an official miniclaw choice",
                ],
        },
        detectedBrowsers,
        exitCode: 0,
        signal: null,
        timedOut: false,
        needsUserAction: false,
        stdout: "",
        stderr: "",
    };
}
function normalizeRequest(params) {
    return {
        browser: normalizeBrowser(params.browser),
        binaryLocation: normalizePath(params.binaryLocation, "binaryLocation"),
        userDataDir: normalizePath(params.userDataDir, "userDataDir"),
        profileName: normalizePath(params.profileName, "profileName"),
        profileMode: normalizeProfileMode(params.profileMode),
        usePrivateWindow: normalizeBoolean(params.usePrivateWindow, "usePrivateWindow"),
        allowUnsupportedBrowser: normalizeBoolean(params.allowUnsupportedBrowser, "allowUnsupportedBrowser") ?? false,
    };
}
async function resolveBinaryUpdates(request, cwd) {
    if (request.browser && request.binaryLocation) {
        throw new Error("browser cannot be combined with binaryLocation");
    }
    if (request.browser === "auto") {
        return { binary_location: "" };
    }
    if (request.browser) {
        const executable = await resolveBrowserChoice(request.browser);
        if (!executable) {
            throw new Error(`${BROWSER_CHOICES[request.browser].label} executable was not found on PATH`);
        }
        return { binary_location: executable };
    }
    if (request.binaryLocation === undefined) {
        return {};
    }
    if (!request.binaryLocation) {
        throw new Error("binaryLocation must not be empty");
    }
    const executable = path.resolve(cwd, request.binaryLocation);
    if (!(await fileIsExecutable(executable))) {
        throw new Error("binaryLocation does not point to an executable file");
    }
    const browser = inferBrowser(executable);
    if (!BROWSER_CHOICES[browser]?.supportedByMiniclaw &&
        !request.allowUnsupportedBrowser) {
        throw new Error("binaryLocation is not a supported miniclaw browser; " +
            "set allowUnsupportedBrowser true to try it as a custom Chromium-family executable");
    }
    return { binary_location: executable };
}
async function resolveProfileUpdates(request, cliConfig, currentConfig, updates) {
    if (request.profileMode === "workspace") {
        return { user_data_dir: "", profile_name: "" };
    }
    if (request.profileMode === "system-default") {
        const effectiveBinary = updates.binary_location ?? currentConfig.binary_location;
        const browser = request.browser && request.browser !== "auto"
            ? request.browser
            : inferBrowser(effectiveBinary) ?? inferBrowser(effectiveAutoBrowser(await detectInstalledBrowsers({
                commandRunner: cliConfig.commandRunner,
            }))?.executable);
        if (!browser) {
            throw new Error("profileMode system-default needs a known browser choice");
        }
        return {
            user_data_dir: path.join(os.homedir(), ...BROWSER_CHOICES[browser].profileDir),
            profile_name: request.profileName ?? "",
        };
    }
    if (request.profileMode === "custom") {
        if (!request.userDataDir) {
            throw new Error("profileMode custom requires userDataDir");
        }
        const profile = {
            user_data_dir: path.resolve(cliConfig.cwd, request.userDataDir),
        };
        if (request.profileName !== undefined) {
            profile.profile_name = request.profileName;
        }
        return profile;
    }
    const profile = {};
    if (request.userDataDir !== undefined) {
        profile.user_data_dir = request.userDataDir
            ? path.resolve(cliConfig.cwd, request.userDataDir)
            : "";
    }
    if (request.profileName !== undefined) {
        profile.profile_name = request.profileName;
    }
    return profile;
}
export async function resolveBrowserUpdates(params = {}, cliConfig, currentBrowserConfig) {
    if (params.confirm !== true) {
        throw new Error("confirm must be true before changing browser config");
    }
    const request = normalizeRequest(params);
    const updates = await resolveBinaryUpdates(request, cliConfig.cwd);
    if (request.usePrivateWindow !== undefined) {
        updates.use_private_window = request.usePrivateWindow;
    }
    Object.assign(updates, await resolveProfileUpdates(request, cliConfig, currentBrowserConfig, updates));
    if (Object.keys(updates).length === 0) {
        throw new Error("provide at least one browser setting to change");
    }
    return updates;
}
