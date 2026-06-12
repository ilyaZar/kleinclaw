/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserConfig } from "../model/config-model.js";
import { remoteDebuggingHostFromArguments, remoteDebuggingPortFromArguments, } from "./browser-arguments.js";
export const DEFAULT_BROWSER_ARGS = [
    "--disable-crash-reporter",
    "--disable-domain-reliability",
    "--disable-sync",
    "--no-experiments",
    "--disable-search-engine-choice-screen",
    "--disable-features=MediaRouter",
    "--use-mock-keychain",
    "--test-type",
    "--host-resolver-rules=\"MAP connect.facebook.net 127.0.0.1, " +
        "MAP securepubads.g.doubleclick.net 127.0.0.1, " +
        "MAP www.googletagmanager.com 127.0.0.1\"",
];
export function buildInitialPrefs() {
    return {
        credentials_enable_service: false,
        enable_do_not_track: true,
        google: { services: { consented_to_sync: false } },
        profile: {
            default_content_setting_values: {
                popups: 0,
                notifications: 2,
            },
            password_manager_enabled: false,
        },
        signin: { allowed: false },
        translate_site_blacklist: ["www.kleinanzeigen.de"],
        devtools: { preferences: { currentDockState: "\"bottom\"" } },
    };
}
export function writeInitialPrefs(prefsFile) {
    fs.writeFileSync(prefsFile, JSON.stringify(buildInitialPrefs()), "utf8");
}
export function hasNonEmptyUserDataDirArg(args) {
    for (const arg of args) {
        if (!arg.startsWith("--user-data-dir=")) {
            continue;
        }
        const raw = arg.split("=", 2)[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
        if (raw) {
            return true;
        }
    }
    return false;
}
function expandUser(filePath, homeDir) {
    if (filePath === "~") {
        return homeDir;
    }
    if (filePath.startsWith("~/")) {
        return path.join(homeDir, filePath.slice(2));
    }
    return filePath;
}
export function resolveUserDataDirPaths(argValue, configValue, { cwd = process.cwd(), homeDir = os.homedir(), } = {}) {
    return [
        path.resolve(cwd, expandUser(argValue, homeDir)),
        path.resolve(cwd, expandUser(configValue, homeDir)),
    ];
}
function userDataDirFromArguments(args, warnings) {
    let userDataDirFromArgs = null;
    for (const browserArg of args) {
        if (!browserArg.startsWith("--user-data-dir=")) {
            continue;
        }
        const raw = browserArg.split("=", 2)[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
        if (!raw) {
            warnings.push("Ignoring empty --user-data-dir= argument; falling back to configured user_data_dir.");
            continue;
        }
        userDataDirFromArgs = raw;
    }
    return userDataDirFromArgs;
}
export function buildBrowserSessionPlan(configOrBrowserConfig, { debugLogging = false, homeDir = os.homedir(), cwd = process.cwd(), } = {}) {
    const browserConfig = configOrBrowserConfig instanceof BrowserConfig
        ? configOrBrowserConfig
        : configOrBrowserConfig.browser;
    const warnings = [];
    const binaryLocation = browserConfig.binaryLocation.trim();
    const remoteHost = remoteDebuggingHostFromArguments(browserConfig.arguments);
    const remotePort = remoteDebuggingPortFromArguments(browserConfig.arguments);
    const environment = {};
    if (remotePort !== null) {
        return {
            mode: "connect",
            browserExecutablePath: binaryLocation,
            remoteHost,
            remotePort,
            browserArgs: [],
            userDataDir: browserConfig.userDataDir.trim() || null,
            profileDir: null,
            preferencesFile: null,
            extensionPaths: [...browserConfig.extensions],
            sandbox: true,
            environment,
            warnings,
        };
    }
    const browserArgs = [...DEFAULT_BROWSER_ARGS];
    const isEdge = binaryLocation.toLowerCase().includes("edge");
    if (isEdge) {
        environment.MSEDGEDRIVER_TELEMETRY_OPTOUT = "1";
    }
    if (browserConfig.usePrivateWindow) {
        browserArgs.push(isEdge ? "-inprivate" : "--incognito");
    }
    if (browserConfig.profileName.trim()) {
        browserArgs.push(`--profile-directory=${browserConfig.profileName.trim()}`);
    }
    for (const browserArg of browserConfig.arguments) {
        if (browserArg.startsWith("--user-data-dir=")) {
            continue;
        }
        browserArgs.push(browserArg);
    }
    const userDataDirFromArgs = userDataDirFromArguments(browserConfig.arguments, warnings);
    const configuredUserDataDir = browserConfig.userDataDir.trim();
    const effectiveUserDataDir = userDataDirFromArgs || configuredUserDataDir || null;
    if (userDataDirFromArgs && configuredUserDataDir) {
        const [argPath, configPath] = resolveUserDataDirPaths(userDataDirFromArgs, configuredUserDataDir, { cwd, homeDir });
        if (argPath !== configPath) {
            warnings.push(`Configured browser.user_data_dir (${configuredUserDataDir}) ` +
                `does not match --user-data-dir argument (${userDataDirFromArgs}); ` +
                "using the argument value.");
        }
    }
    if (!debugLogging) {
        browserArgs.push("--log-level=3");
    }
    const profileDir = effectiveUserDataDir
        ? path.join(effectiveUserDataDir, browserConfig.profileName.trim() || "Default")
        : null;
    return {
        mode: "launch",
        browserExecutablePath: binaryLocation,
        remoteHost,
        remotePort,
        browserArgs,
        userDataDir: effectiveUserDataDir,
        profileDir,
        preferencesFile: profileDir ? path.join(profileDir, "Preferences") : null,
        extensionPaths: [...browserConfig.extensions],
        sandbox: !browserArgs.includes("--no-sandbox"),
        environment,
        warnings,
    };
}
