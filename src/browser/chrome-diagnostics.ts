/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

import {
  remoteDebuggingHostFromArguments,
  remoteDebuggingPortFromArguments,
} from "./browser-arguments.js";
import { getCompatibleBrowser } from "./session-plan.js";
import { type Config } from "../model/config-model.js";

const execFileAsync = promisify(execFile);
export const CHROME_136_VERSION = 136;

export type DiagnosticStatus = "ok" | "fail" | "info" | "warn";

export interface BrowserDiagnosticLine {
  status: DiagnosticStatus;
  message: string;
}

export interface BrowserDiagnosticReport {
  lines: BrowserDiagnosticLine[];
  remoteDebuggingPort: number | null;
  liveProbesSkipped: boolean;
}

export interface ChromeVersionProbeOptions {
  binaryPath: string | null;
  remoteHost: string;
  remotePort: number | null;
  remoteTimeout: number;
  binaryTimeout: number;
}

export class ChromeVersionInfo {
  readonly versionString: string;
  readonly majorVersion: number;
  readonly browserName: string;

  constructor(versionString: string, majorVersion: number, browserName = "Unknown") {
    this.versionString = versionString;
    this.majorVersion = majorVersion;
    this.browserName = browserName;
  }

  get isChrome136Plus(): boolean {
    return this.majorVersion >= CHROME_136_VERSION;
  }

  toString(): string {
    return `${this.browserName} ${this.versionString} (major: ${this.majorVersion})`;
  }
}

export function parseVersionString(versionString: string): number {
  const match = /(\d+)\.\d+\.\d+\.\d+/.exec(versionString);
  if (!match?.[1]) {
    throw new Error(`Could not parse version string: ${versionString}`);
  }
  return Number.parseInt(match[1], 10);
}

export function normalizeBrowserName(browserName: string): string {
  const lower = browserName.toLowerCase();
  if (lower.includes("edge") || lower.includes("edg")) {
    return "Edge";
  }
  if (lower.includes("chromium")) {
    return "Chromium";
  }
  return "Chrome";
}

export async function detectChromeVersionFromBinary(
  binaryPath: string,
  { timeout = 10 }: { timeout?: number } = {},
): Promise<ChromeVersionInfo | null> {
  try {
    const result = await execFileAsync(binaryPath, ["--version"], {
      timeout: timeout * 1000,
    });
    const output = result.stdout.trim();
    const majorVersion = parseVersionString(output);
    const versionString = /(\d+\.\d+\.\d+\.\d+)/.exec(output)?.[1] ?? output;
    return new ChromeVersionInfo(
      versionString,
      majorVersion,
      normalizeBrowserName(binaryPath),
    );
  } catch {
    return null;
  }
}

export async function detectChromeVersionFromRemoteDebugging(
  {
    host = "127.0.0.1",
    port = 9222,
    timeout = 5,
  }: {
    host?: string;
    port?: number;
    timeout?: number;
  } = {},
): Promise<ChromeVersionInfo | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout * 1000);
    const response = await fetch(`http://${host}:${port}/json/version`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      return null;
    }
    const data = await response.json() as Record<string, unknown>;
    const userAgent = typeof data["User-Agent"] === "string" ? data["User-Agent"] : "";
    const browser = typeof data.Browser === "string" ? data.Browser : "Unknown";
    const match = /Chrome\/(\d+\.\d+\.\d+\.\d+)/.exec(userAgent);
    if (!match?.[1]) {
      return null;
    }
    return new ChromeVersionInfo(
      match[1],
      parseVersionString(match[1]),
      normalizeBrowserName(browser),
    );
  } catch {
    return null;
  }
}

export function validateChrome136Configuration(
  browserArguments: string[],
  userDataDir: string | null | undefined,
): [boolean, string] {
  const hasUserDataDirArg = browserArguments.some((arg) =>
    arg.startsWith("--user-data-dir="),
  );
  const hasUserDataDirConfig = typeof userDataDir === "string" &&
    userDataDir.trim() !== "";

  if (!hasUserDataDirArg && !hasUserDataDirConfig) {
    return [
      false,
      "Chrome/Edge 136+ requires --user-data-dir to be specified. " +
        "Add --user-data-dir=/path/to/directory to your browser arguments and " +
        'user_data_dir: "/path/to/directory" to your configuration.',
    ];
  }

  return [true, ""];
}

function accessOk(filePath: string, mode: number): boolean {
  try {
    fs.accessSync(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

export function buildBrowserDiagnosticReport(config: Config): BrowserDiagnosticReport {
  const lines: BrowserDiagnosticLine[] = [];
  const browserConfig = config.browser;
  const binaryPath = browserConfig.binaryLocation.trim();

  lines.push({
    status: "info",
    message: "=== Browser Connection Diagnostics ===",
  });

  if (binaryPath) {
    if (fs.existsSync(binaryPath)) {
      lines.push({ status: "ok", message: `Browser binary exists: ${binaryPath}` });
      if (accessOk(binaryPath, fs.constants.X_OK)) {
        lines.push({ status: "ok", message: "Browser binary is executable" });
      } else {
        lines.push({ status: "fail", message: "Browser binary is not executable" });
      }
    } else {
      lines.push({ status: "fail", message: `Browser binary not found: ${binaryPath}` });
    }
  } else {
    try {
      lines.push({
        status: "ok",
        message: `Browser auto-detected: ${getCompatibleBrowser()}`,
      });
    } catch (error) {
      lines.push({
        status: "fail",
        message: "Browser auto-detection failed: " +
          (error instanceof Error ? error.message : String(error)),
      });
    }
  }

  const userDataDir = browserConfig.userDataDir.trim();
  if (userDataDir) {
    if (fs.existsSync(userDataDir)) {
      lines.push({
        status: "ok",
        message: `User data directory exists: ${userDataDir}`,
      });
      if (accessOk(userDataDir, fs.constants.R_OK | fs.constants.W_OK)) {
        lines.push({
          status: "ok",
          message: "User data directory is readable and writable",
        });
      } else {
        lines.push({
          status: "fail",
          message: "User data directory permissions issue",
        });
      }
    } else {
      lines.push({
        status: "info",
        message: `User data directory does not exist (will be created): ${userDataDir}`,
      });
    }
  }

  const remoteDebuggingPort = remoteDebuggingPortFromArguments(browserConfig.arguments);
  if (remoteDebuggingPort !== null) {
    lines.push({
      status: "info",
      message: `Remote debugging port configured: ${remoteDebuggingPort}`,
    });
    lines.push({
      status: "info",
      message: "Remote debugging port probe skipped by browser-free diagnostics.",
    });
  }

  if (remoteDebuggingPort === null) {
    lines.push({
      status: "info",
      message: "Chrome 136+ validation skipped because remote debugging is not configured.",
    });
  } else {
    const [chrome136Valid, chrome136Message] = validateChrome136Configuration(
      browserConfig.arguments,
      browserConfig.userDataDir,
    );
    if (chrome136Valid) {
      lines.push({
        status: "ok",
        message: "Chrome 136+ configuration validation passed",
      });
    } else {
      lines.push({
        status: "fail",
        message: `Chrome 136+ configuration validation failed: ${chrome136Message}`,
      });
      lines.push({
        status: "info",
        message: "Solution: Add --user-data-dir=/path/to/directory to browser arguments",
      });
    }
  }

  if (remoteDebuggingPort !== null) {
    lines.push({
      status: "info",
      message: "Chrome/Edge 136+ security changes require --user-data-dir.",
    });
  }

  lines.push({
    status: "info",
    message: "Browser process inspection skipped by browser-free diagnostics.",
  });
  lines.push({ status: "info", message: "=== End Diagnostics ===" });

  return {
    lines,
    remoteDebuggingPort,
    liveProbesSkipped: true,
  };
}

export function chromeVersionProbeOptionsFromConfig(
  config: Config,
): ChromeVersionProbeOptions {
  const browserConfig = config.browser;
  const binaryPath = browserConfig.binaryLocation.trim();

  return {
    binaryPath: binaryPath || null,
    remoteHost: remoteDebuggingHostFromArguments(browserConfig.arguments),
    remotePort: remoteDebuggingPortFromArguments(browserConfig.arguments),
    remoteTimeout: config.timeouts.effective("chromeRemoteDebugging"),
    binaryTimeout: config.timeouts.effective("chromeBinaryDetection"),
  };
}

export async function getChromeVersionDiagnosticInfo({
  binaryPath,
  remoteHost = "127.0.0.1",
  remotePort,
  remoteTimeout,
  binaryTimeout,
}: {
  binaryPath?: string | null;
  remoteHost?: string;
  remotePort?: number | null;
  remoteTimeout?: number;
  binaryTimeout?: number;
} = {}): Promise<Record<string, unknown>> {
  const diagnosticInfo: Record<string, unknown> = {
    binary_detection: null,
    remote_detection: null,
    chrome_136_plus_detected: false,
    configuration_valid: true,
    recommendations: [],
  };

  if (binaryPath) {
    const versionInfo = await detectChromeVersionFromBinary(binaryPath, {
      timeout: binaryTimeout,
    });
    if (versionInfo) {
      diagnosticInfo.binary_detection = {
        version_string: versionInfo.versionString,
        major_version: versionInfo.majorVersion,
        browser_name: versionInfo.browserName,
        is_chrome_136_plus: versionInfo.isChrome136Plus,
      };
      diagnosticInfo.chrome_136_plus_detected = versionInfo.isChrome136Plus;
    }
  }

  if (remotePort) {
    const versionInfo = await detectChromeVersionFromRemoteDebugging({
      host: remoteHost,
      port: remotePort,
      timeout: remoteTimeout,
    });
    if (versionInfo) {
      diagnosticInfo.remote_detection = {
        version_string: versionInfo.versionString,
        major_version: versionInfo.majorVersion,
        browser_name: versionInfo.browserName,
        is_chrome_136_plus: versionInfo.isChrome136Plus,
      };
      diagnosticInfo.chrome_136_plus_detected = versionInfo.isChrome136Plus;
    }
  }

  if (diagnosticInfo.chrome_136_plus_detected) {
    (diagnosticInfo.recommendations as string[]).push(
      "Chrome 136+ detected - ensure --user-data-dir is configured for remote debugging",
    );
  }

  return diagnosticInfo;
}

export async function getChromeVersionDiagnosticInfoFromConfig(
  config: Config,
): Promise<Record<string, unknown>> {
  return getChromeVersionDiagnosticInfo(
    chromeVersionProbeOptionsFromConfig(config),
  );
}
