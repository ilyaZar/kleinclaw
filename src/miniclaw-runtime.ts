import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeWorkspaceMode,
} from "./input.js";
import { parseMiniclawResult } from "./miniclaw-protocol.js";
import {
  buildRedactions,
  runProcess,
  sanitizeText,
  type CommandRunner,
  type ProcessResult,
  type RedactionConfig,
} from "./process-boundary.js";

export const OPERATIONS = Object.freeze({
  verify: { sideEffect: false },
  diagnose: { sideEffect: false },
  publish: { sideEffect: true, defaultSelector: "due" },
  update: { sideEffect: true, defaultSelector: "changed" },
  delete: { sideEffect: true, requiresIds: true },
  download: { sideEffect: true, defaultSelector: "new" },
  extend: { sideEffect: true, defaultSelector: "all" },
});

const STATUS_TIMEOUT_MS = 15000;
const PROTOCOL_OUTPUT_CHARS = 65536;
const EMBEDDED_CLI = fileURLToPath(
  new URL("../miniclaw/dist/cli.js", import.meta.url),
);
const EMBEDDED_REDACTIONS = {
  runtime: { command: process.execPath, argsPrefix: [EMBEDDED_CLI] },
};

interface HostConfig extends RedactionConfig {
  commandRunner?: unknown;
  manualActionTimeoutSeconds?: unknown;
  maxOutputChars?: unknown;
  timeoutMs?: unknown;
  workspaceMode?: unknown;
}

interface CliConfig {
  commandRunner?: CommandRunner;
  configPath: string;
  cwd: string;
  manualActionTimeoutSeconds: number;
  maxOutputChars: number;
  timeoutMs: number;
  workspaceMode: "portable" | "xdg";
}

function resolveConfigLocation(config: HostConfig): {
  configPath?: string;
  cwd?: string;
} {
  const configuredPath = normalizeOptionalString(config.configPath);
  const configuredCwd = normalizeOptionalString(config.workingDirectory);
  const configPath = configuredPath ??
    (configuredCwd ? path.join(configuredCwd, "config.yaml") : undefined);
  return {
    configPath,
    cwd: configuredCwd ?? (configPath ? path.dirname(configPath) : undefined),
  };
}

export const DEFAULT_MANUAL_ACTION_TIMEOUT_SECONDS = 300;

export function manualActionTimeoutSeconds(config: { manualActionTimeoutSeconds?: unknown }): number {
  return normalizePositiveInteger(
    config.manualActionTimeoutSeconds,
    DEFAULT_MANUAL_ACTION_TIMEOUT_SECONDS,
    0,
    1800,
  );
}

export function resolveCliConfig(config: HostConfig = {}): CliConfig {
  const { configPath, cwd } = resolveConfigLocation(config);
  if (!configPath || !cwd) {
    throw new Error("plugin config must set configPath or workingDirectory");
  }
  return {
    configPath,
    cwd,
    workspaceMode: normalizeWorkspaceMode(config.workspaceMode),
    timeoutMs: normalizePositiveInteger(
      config.timeoutMs,
      120000,
      1000,
      600000,
    ),
    manualActionTimeoutSeconds: manualActionTimeoutSeconds(config),
    maxOutputChars: normalizePositiveInteger(
      config.maxOutputChars,
      6000,
      0,
      20000,
    ),
    commandRunner: typeof config.commandRunner === "function"
      ? config.commandRunner as CommandRunner
      : undefined,
  };
}

export async function assertConfiguredFiles(
  config: Pick<CliConfig, "configPath">,
): Promise<void> {
  try {
    if (!(await fs.stat(config.configPath)).isFile()) {
      throw new Error("configured miniclaw config is not a file");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("configured miniclaw config was not found");
    }
    throw error;
  }
}

function runRuntime(
  args: readonly string[],
  options: {
    commandRunner?: CommandRunner;
    cwd?: string;
    maxBufferChars: number;
    timeoutMs: number;
  },
): Promise<ProcessResult> {
  return runProcess(
    process.execPath,
    [EMBEDDED_CLI, ...args],
    options,
  );
}

function sanitizeProcessError(
  result: ProcessResult,
  redactions: readonly string[],
  maxChars: number,
): string {
  const text = result.error
    ? `${result.stderr}\n${result.error.message}`
    : result.stderr;
  return sanitizeText(text, redactions, maxChars);
}

export async function invokeMiniclaw(
  command: string,
  args: readonly string[],
  cliConfig: CliConfig,
  redactionConfig: HostConfig = {},
) {
  // Live browser runs may wait for the user to solve a captcha or a device
  // verification, so their budget includes that wait.
  const timeoutMs = args.includes("--allow-live-browser")
    ? cliConfig.timeoutMs + cliConfig.manualActionTimeoutSeconds * 1000
    : cliConfig.timeoutMs;
  const result = await runRuntime(args, {
    cwd: cliConfig.cwd,
    timeoutMs,
    maxBufferChars: PROTOCOL_OUTPUT_CHARS,
    commandRunner: cliConfig.commandRunner,
  });
  const redactions = buildRedactions({
    ...redactionConfig,
    ...cliConfig,
    ...EMBEDDED_REDACTIONS,
  });
  const parsed = parseMiniclawResult(result.stdout, command, result);
  const diagnostics = parsed.ok
    ? parsed.result.diagnostics.map((entry) => ({
        severity: entry.severity,
        kind: entry.code,
        message: sanitizeText(
          entry.message,
          redactions,
          cliConfig.maxOutputChars,
        ),
        ...(entry.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: entry.retryAfterSeconds }),
      }))
    : [];
  return {
    result,
    parsed,
    diagnostics,
    stderr: sanitizeProcessError(
      result,
      redactions,
      cliConfig.maxOutputChars,
    ),
  };
}

export async function getKleinanzeigenStatus(config: HostConfig = {}) {
  const { configPath, cwd } = resolveConfigLocation(config);
  const commandRunner = typeof config.commandRunner === "function"
    ? config.commandRunner as CommandRunner
    : undefined;
  const configFile = {
    configured: Boolean(configPath),
    exists: false,
    isFile: false,
  };
  if (configPath) {
    try {
      const stat = await fs.stat(configPath);
      configFile.exists = true;
      configFile.isFile = stat.isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const result = await runRuntime(["--output=json", "version"], {
    cwd,
    timeoutMs: STATUS_TIMEOUT_MS,
    maxBufferChars: PROTOCOL_OUTPUT_CHARS,
    commandRunner,
  });
  const parsed = parseMiniclawResult(result.stdout, "version", result);
  const succeeded = parsed.ok && parsed.result.status === "succeeded";
  const available = succeeded ? parsed.result.commands ?? [] : [];
  const redactions = buildRedactions({
    ...config,
    ...EMBEDDED_REDACTIONS,
    workingDirectory: cwd,
    configPath,
  });

  return {
    ok: Boolean(succeeded && result.ok && configFile.configured && configFile.isFile),
    operation: "status",
    executable: "miniclaw",
    cwd: cwd ? "[redacted-path]" : null,
    configFile,
    workspaceMode: normalizeWorkspaceMode(config.workspaceMode),
    version: succeeded ? parsed.result.version : "",
    commands: Object.fromEntries(
      Object.keys(OPERATIONS).map((operation) => [
        operation,
        available.includes(operation),
      ]),
    ),
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    needsUserAction: false,
    stdout: "",
    stderr: sanitizeProcessError(result, redactions, 1000),
  };
}
