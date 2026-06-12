/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BrowserConfig, type Config } from "../model/config-model.js";
import {
  remoteDebuggingHostFromArguments,
  remoteDebuggingPortFromArguments,
} from "./browser-arguments.js";

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
] as const;

export interface BrowserSessionPlanOptions {
  defaultUserDataDir?: string | null;
  debugLogging?: boolean;
  homeDir?: string;
  cwd?: string;
}

export interface BrowserCandidateOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  searchPath?: string;
}

export interface BrowserSessionPlan {
  mode: "connect" | "launch";
  browserExecutablePath: string;
  remoteHost: string;
  remotePort: number | null;
  browserArgs: string[];
  userDataDir: string | null;
  profileDir: string | null;
  preferencesFile: string | null;
  extensionPaths: string[];
  sandbox: boolean;
  environment: Record<string, string>;
  warnings: string[];
}

function fileIsExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function fileIsFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function pathExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function which(command: string, searchPath = process.env.PATH ?? ""): string | null {
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) {
      continue;
    }
    const candidate = path.join(directory, command);
    if (fs.existsSync(candidate) && fileIsExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function browserCandidatePaths({
  env = process.env,
  homeDir = os.homedir(),
  platform = process.platform,
  searchPath = process.env.PATH ?? "",
}: BrowserCandidateOptions = {}): Array<string | null> {
  void homeDir;
  const winPath = (...parts: string[]) => path.win32.join(...parts);
  const programFiles = env.PROGRAMFILES ?? "C:\\Program Files";
  const programFilesX86 = env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
  const localAppData = env.LOCALAPPDATA ??
    (env.USERPROFILE
      ? winPath(env.USERPROFILE, "AppData", "Local")
      : null);
  return (
    platform === "linux"
      ? [
          which("chromium", searchPath),
          which("chromium-browser", searchPath),
          which("google-chrome", searchPath),
          which("microsoft-edge", searchPath),
        ]
      : platform === "darwin"
        ? [
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : platform === "win32"
          ? [
              localAppData ? winPath(localAppData, "Google", "Chrome", "Application", "chrome.exe") : null,
              winPath(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
              winPath(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
              localAppData ? winPath(localAppData, "Microsoft", "Edge", "Application", "msedge.exe") : null,
              winPath(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
              winPath(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
              localAppData ? winPath(localAppData, "Chromium", "Application", "chrome.exe") : null,
              winPath(programFiles, "Chromium", "Application", "chrome.exe"),
              winPath(programFilesX86, "Chromium", "Application", "chrome.exe"),
              winPath(programFiles, "Chrome", "Application", "chrome.exe"),
              winPath(programFilesX86, "Chrome", "Application", "chrome.exe"),
              localAppData ? winPath(localAppData, "Chrome", "Application", "chrome.exe") : null,
              which("msedge.exe", searchPath),
              which("chromium.exe", searchPath),
              which("chrome.exe", searchPath),
            ]
          : []
  );
}

export function getCompatibleBrowser(
  options: BrowserCandidateOptions = {},
): string {
  const candidates = browserCandidatePaths(options);
  if (candidates.length === 0) {
    throw new Error(
      `Installed browser for OS ${options.platform ?? process.platform} could not be detected`,
    );
  }
  for (const candidate of candidates) {
    if (candidate && fileIsFile(candidate)) {
      return candidate;
    }
  }
  throw new Error("Installed browser could not be detected");
}

export function buildInitialPrefs(): Record<string, unknown> {
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

export function writeInitialPrefs(prefsFile: string): void {
  fs.writeFileSync(prefsFile, JSON.stringify(buildInitialPrefs()), "utf8");
}

export function hasNonEmptyUserDataDirArg(args: Iterable<string>): boolean {
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

function expandUser(filePath: string, homeDir: string): string {
  if (filePath === "~") {
    return homeDir;
  }
  if (filePath.startsWith("~/")) {
    return path.join(homeDir, filePath.slice(2));
  }
  return filePath;
}

function resolveConfiguredPath(filePath: string, cwd: string, homeDir: string): string {
  return path.resolve(cwd, expandUser(filePath, homeDir));
}

export function resolveUserDataDirPaths(
  argValue: string,
  configValue: string,
  {
    cwd = process.cwd(),
    homeDir = os.homedir(),
  }: {
    cwd?: string;
    homeDir?: string;
  } = {},
): [string, string] {
  return [
    path.resolve(cwd, expandUser(argValue, homeDir)),
    path.resolve(cwd, expandUser(configValue, homeDir)),
  ];
}

function userDataDirFromArguments(args: string[], warnings: string[]): string | null {
  let userDataDirFromArgs: string | null = null;
  for (const browserArg of args) {
    if (!browserArg.startsWith("--user-data-dir=")) {
      continue;
    }
    const raw = browserArg.split("=", 2)[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
    if (!raw) {
      warnings.push(
        "Ignoring empty --user-data-dir= argument; falling back to configured user_data_dir.",
      );
      continue;
    }
    userDataDirFromArgs = raw;
  }
  return userDataDirFromArgs;
}

export function buildBrowserSessionPlan(
  configOrBrowserConfig: Config | BrowserConfig,
  {
    defaultUserDataDir = null,
    debugLogging = false,
    homeDir = os.homedir(),
    cwd = process.cwd(),
  }: BrowserSessionPlanOptions = {},
): BrowserSessionPlan {
  const browserConfig = configOrBrowserConfig instanceof BrowserConfig
    ? configOrBrowserConfig
    : configOrBrowserConfig.browser;
  const warnings: string[] = [];
  const configuredBinaryLocation = browserConfig.binaryLocation.trim();
  if (configuredBinaryLocation && !pathExists(configuredBinaryLocation)) {
    throw new Error(
      `Specified browser binary [${configuredBinaryLocation}] does not exist.`,
    );
  }
  const binaryLocation = configuredBinaryLocation || getCompatibleBrowser({ homeDir });
  const remoteHost = remoteDebuggingHostFromArguments(browserConfig.arguments);
  const remotePort = remoteDebuggingPortFromArguments(browserConfig.arguments);
  const environment: Record<string, string> = {};
  const extensionPaths = browserConfig.extensions.map((extensionPath) =>
    resolveConfiguredPath(extensionPath, cwd, homeDir)
  );

  if (remotePort !== null) {
    return {
      mode: "connect",
      browserExecutablePath: binaryLocation,
      remoteHost,
      remotePort,
      browserArgs: [],
      userDataDir: null,
      profileDir: null,
      preferencesFile: null,
      extensionPaths: [],
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

  const userDataDirFromArgs = userDataDirFromArguments(
    browserConfig.arguments,
    warnings,
  );
  const configuredUserDataDir = browserConfig.userDataDir.trim();
  const rawUserDataDir = userDataDirFromArgs || configuredUserDataDir || defaultUserDataDir;
  const effectiveUserDataDir = rawUserDataDir
    ? resolveConfiguredPath(rawUserDataDir, cwd, homeDir)
    : null;
  if (userDataDirFromArgs && configuredUserDataDir) {
    const [argPath, configPath] = resolveUserDataDirPaths(
      userDataDirFromArgs,
      configuredUserDataDir,
      { cwd, homeDir },
    );
    if (argPath !== configPath) {
      warnings.push(
        `Configured browser.user_data_dir (${configuredUserDataDir}) ` +
          `does not match --user-data-dir argument (${userDataDirFromArgs}); ` +
          "using the argument value.",
      );
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
    extensionPaths,
    sandbox: !browserArgs.includes("--no-sandbox"),
    environment,
    warnings,
  };
}
