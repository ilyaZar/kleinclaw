import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOptionalString, normalizePositiveInteger, normalizeWorkspaceMode, } from "./input.js";
import { parseMiniclawResult } from "./miniclaw-protocol.js";
import { buildRedactions, runProcess, sanitizeText, } from "./process-boundary.js";
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
const EMBEDDED_CLI = fileURLToPath(new URL("../miniclaw/dist/cli.js", import.meta.url));
const EMBEDDED_REDACTIONS = {
    runtime: { command: process.execPath, argsPrefix: [EMBEDDED_CLI] },
};
function resolveConfigLocation(config) {
    const configuredPath = normalizeOptionalString(config.configPath);
    const configuredCwd = normalizeOptionalString(config.workingDirectory);
    const configPath = configuredPath ??
        (configuredCwd ? path.join(configuredCwd, "config.yaml") : undefined);
    return {
        configPath,
        cwd: configuredCwd ?? (configPath ? path.dirname(configPath) : undefined),
    };
}
export function resolveCliConfig(config = {}) {
    const { configPath, cwd } = resolveConfigLocation(config);
    if (!configPath || !cwd) {
        throw new Error("plugin config must set configPath or workingDirectory");
    }
    return {
        configPath,
        cwd,
        workspaceMode: normalizeWorkspaceMode(config.workspaceMode),
        timeoutMs: normalizePositiveInteger(config.timeoutMs, 120000, 1000, 600000),
        maxOutputChars: normalizePositiveInteger(config.maxOutputChars, 6000, 0, 20000),
        commandRunner: typeof config.commandRunner === "function"
            ? config.commandRunner
            : undefined,
    };
}
export async function assertConfiguredFiles(config) {
    try {
        if (!(await fs.stat(config.configPath)).isFile()) {
            throw new Error("configured miniclaw config is not a file");
        }
    }
    catch (error) {
        if (error.code === "ENOENT") {
            throw new Error("configured miniclaw config was not found");
        }
        throw error;
    }
}
function runRuntime(args, options) {
    return runProcess(process.execPath, [EMBEDDED_CLI, ...args], options);
}
function sanitizeProcessError(result, redactions, maxChars) {
    const text = result.error
        ? `${result.stderr}\n${result.error.message}`
        : result.stderr;
    return sanitizeText(text, redactions, maxChars);
}
export async function invokeMiniclaw(command, args, cliConfig, redactionConfig = {}) {
    const result = await runRuntime(args, {
        cwd: cliConfig.cwd,
        timeoutMs: cliConfig.timeoutMs,
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
            message: sanitizeText(entry.message, redactions, cliConfig.maxOutputChars),
            ...(entry.retryAfterSeconds === undefined
                ? {}
                : { retryAfterSeconds: entry.retryAfterSeconds }),
        }))
        : [];
    return {
        result,
        parsed,
        diagnostics,
        stderr: sanitizeProcessError(result, redactions, cliConfig.maxOutputChars),
    };
}
export async function getKleinanzeigenStatus(config = {}) {
    const { configPath, cwd } = resolveConfigLocation(config);
    const commandRunner = typeof config.commandRunner === "function"
        ? config.commandRunner
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
        }
        catch (error) {
            if (error.code !== "ENOENT") {
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
        commands: Object.fromEntries(Object.keys(OPERATIONS).map((operation) => [
            operation,
            available.includes(operation),
        ])),
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        needsUserAction: false,
        stdout: "",
        stderr: sanitizeProcessError(result, redactions, 1000),
    };
}
