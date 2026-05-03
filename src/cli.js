import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export const OPERATIONS = Object.freeze({
  verify: { command: "verify", sideEffect: false },
  publish: { command: "publish", sideEffect: true, defaultSelector: "due" },
  update: { command: "update", sideEffect: true, defaultSelector: "changed" },
  delete: { command: "delete", sideEffect: true, requiresIds: true },
  download: { command: "download", sideEffect: true, defaultSelector: "new" },
  extend: { command: "extend", sideEffect: true, defaultSelector: "all" },
});

const ALLOWED_ENV_KEYS = new Set([
  "DBUS_SESSION_BUS_ADDRESS",
  "DISPLAY",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_MESSAGES",
  "LOGNAME",
  "PATH",
  "SHELL",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USER",
  "WAYLAND_DISPLAY",
  "XAUTHORITY",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
  "XDG_STATE_HOME",
]);

const SECRET_ENV_RE = /(api|auth|cookie|credential|key|login|pass|secret|session|sms|token|user)/i;
const SENSITIVE_LINE_RE =
  /\b(password|passwd|username|login|cookie|session|token|secret|credential|2fa|sms|user[_-]?data[_-]?dir|profile_name|browser profile)\b/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const USER_ACTION_RE =
  /\b(press (enter|a key)|when done|manual inspection|please solve|eof when reading a line|eoferror)\b/i;
const USER_ACTION_HINT = [
  "The local bot stopped for a manual account step.",
  "Run it directly in a terminal/browser, finish that step, then retry this tool.",
].join(" ");
const STATUS_TIMEOUT_MS = 15000;
const STATUS_OUTPUT_CHARS = 3000;

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePositiveInteger(value, fallback, min, max) {
  if (!Number.isInteger(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

function normalizeAdIds(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("adIds must be an array");
  }
  const ids = value.map((entry) => String(entry).trim()).filter(Boolean);
  if (ids.length === 0) {
    throw new Error("adIds must not be empty");
  }
  for (const id of ids) {
    if (!/^\d+$/.test(id)) {
      throw new Error("adIds may contain only numeric ad IDs");
    }
  }
  return ids;
}

function normalizeSelector(value, allowed, fallback) {
  const selector = normalizeOptionalString(value) ?? fallback;
  if (selector && !allowed.includes(selector)) {
    throw new Error(`selector must be one of: ${allowed.join(", ")}`);
  }
  return selector;
}

function normalizeSelectorList(value, allowed) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("selectors must be an array");
  }
  const selectors = value.map((entry) => String(entry).trim()).filter(Boolean);
  if (selectors.length === 0) {
    throw new Error("selectors must not be empty");
  }
  for (const selector of selectors) {
    if (!allowed.includes(selector)) {
      throw new Error(`selectors must contain only: ${allowed.join(", ")}`);
    }
  }
  return [...new Set(selectors)];
}

function requireConfirmed(operation, params) {
  if (OPERATIONS[operation]?.sideEffect && params.confirm !== true) {
    throw new Error("confirm must be true for this account-changing operation");
  }
}

export function buildKleinanzeigenArgs(operation, params = {}, config = {}) {
  const spec = OPERATIONS[operation];
  if (!spec) {
    throw new Error(`unsupported operation: ${operation}`);
  }

  requireConfirmed(operation, params);

  const args = [];
  const configPath = normalizeOptionalString(config.configPath);
  const workspaceMode = normalizeOptionalString(config.workspaceMode);
  const lang = normalizeOptionalString(config.lang);

  if (!configPath) {
    throw new Error("plugin config must set configPath or workingDirectory");
  }
  args.push(`--config=${configPath}`);
  args.push("--logfile=");

  if (workspaceMode) {
    if (!["portable", "xdg"].includes(workspaceMode)) {
      throw new Error("workspaceMode must be portable or xdg");
    }
    args.push(`--workspace-mode=${workspaceMode}`);
  }
  if (lang) {
    if (!["en", "de"].includes(lang)) {
      throw new Error("lang must be en or de");
    }
    args.push(`--lang=${lang}`);
  }

  args.push(spec.command);

  if (operation === "verify") {
    return args;
  }

  const adIds = normalizeAdIds(params.adIds);
  if (adIds && (params.selector !== undefined || params.selectors !== undefined)) {
    throw new Error("adIds cannot be combined with selectors");
  }
  if (spec.requiresIds && !adIds) {
    throw new Error("adIds are required for delete");
  }

  const selectorByOperation = {
    publish: ["due", "new", "changed", "all"],
    update: ["changed", "all"],
    download: ["new", "all"],
    extend: ["all"],
  };
  const allowedSelectors = selectorByOperation[operation];

  if (params.selector !== undefined && params.selectors !== undefined) {
    throw new Error("selector and selectors cannot be combined");
  }

  const ads =
    adIds?.join(",") ??
    (allowedSelectors
      ? (operation === "publish" && params.selectors !== undefined
          ? normalizeSelectorList(params.selectors, allowedSelectors)?.join(",")
          : normalizeSelector(params.selector, allowedSelectors, spec.defaultSelector))
      : undefined);

  if (ads) {
    args.push(`--ads=${ads}`);
  }

  if (operation === "publish" && params.keepOld === true) {
    args.push("--keep-old");
  }

  return args;
}

export function buildChildEnv(sourceEnv = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (!ALLOWED_ENV_KEYS.has(key) || SECRET_ENV_RE.test(key) || value === undefined) {
      continue;
    }
    env[key] = value;
  }
  return env;
}

export function buildRedactions(config = {}) {
  return [
    config.cliPath,
    config.workingDirectory,
    config.configPath,
  ].filter((value) => typeof value === "string" && value.trim());
}

export function sanitizeText(text, redactions = [], maxChars = 6000) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  const sanitizedLines = normalized.split("\n").map((line) => {
    if (SENSITIVE_LINE_RE.test(line)) {
      return "[redacted sensitive line]";
    }

    let next = line.replace(EMAIL_RE, "[redacted-email]");
    for (const raw of redactions) {
      const value = String(raw).trim();
      if (value) {
        next = next.split(value).join("[redacted-path]");
      }
    }
    return next;
  });

  const sanitized = sanitizedLines.join("\n").trim();
  if (maxChars <= 0) {
    return "";
  }
  if (sanitized.length <= maxChars) {
    return sanitized;
  }
  return `${sanitized.slice(0, maxChars)}\n[truncated]`;
}

export function redactArgs(args = []) {
  return args.map((arg) => {
    if (arg.startsWith("--config=")) {
      return "--config=[redacted]";
    }
    if (arg === "--logfile=") {
      return arg;
    }
    if (arg.startsWith("--logfile=")) {
      return "--logfile=[redacted]";
    }
    return arg;
  });
}

export function detectUserActionRequest(text) {
  return {
    needsUserAction: USER_ACTION_RE.test(String(text ?? "")),
    userActionHint: USER_ACTION_HINT,
  };
}

export function resolveCliConfig(config = {}) {
  const cliPath = normalizeOptionalString(config.cliPath) ?? "kleinanzeigen-bot";
  const configuredConfigPath = normalizeOptionalString(config.configPath);
  const configuredCwd = normalizeOptionalString(config.workingDirectory);
  const configPath =
    configuredConfigPath ?? (configuredCwd ? path.join(configuredCwd, "config.yaml") : undefined);
  if (!configPath) {
    throw new Error("plugin config must set configPath or workingDirectory");
  }
  const cwd = configuredCwd ?? path.dirname(configPath);

  return {
    cliPath,
    cwd,
    configPath,
    workspaceMode: normalizeOptionalString(config.workspaceMode),
    lang: normalizeOptionalString(config.lang),
    timeoutMs: normalizePositiveInteger(config.timeoutMs, 120000, 1000, 600000),
    maxOutputChars: normalizePositiveInteger(config.maxOutputChars, 6000, 0, 20000),
  };
}

function resolveConfiguredConfigPath(config = {}) {
  const configuredConfigPath = normalizeOptionalString(config.configPath);
  const configuredCwd = normalizeOptionalString(config.workingDirectory);
  return configuredConfigPath ?? (configuredCwd ? path.join(configuredCwd, "config.yaml") : undefined);
}

async function assertConfiguredFiles(config) {
  try {
    const stat = await fs.stat(config.configPath);
    if (!stat.isFile()) {
      throw new Error("configured bot config is not a file");
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("configured bot config was not found");
    }
    throw error;
  }
}

function commandSupportFromHelp(text) {
  const lower = String(text ?? "").toLowerCase();
  return Object.fromEntries(
    Object.keys(OPERATIONS).map((operation) => [operation, lower.includes(operation)]),
  );
}

function firstNonEmptyLine(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

export function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
  const maxBufferChars = Number.isInteger(options.maxBufferChars)
    ? Math.max(options.maxBufferChars, 0)
    : 20000;
  const captureLimit = maxBufferChars + 1;

  const appendOutput = (current, chunk) => {
    if (current.length >= captureLimit) {
      return current;
    }
    const remaining = captureLimit - current.length;
    return current + String(chunk).slice(0, remaining);
  };

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? buildChildEnv(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, timeoutMs);
    timer.unref();

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout = appendOutput(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendOutput(stderr, chunk);
    });

    child.on("error", (error) => {
      finish({ ok: false, exitCode: null, signal: null, stdout, stderr, error, timedOut });
    });

    child.on("close", (exitCode, signal) => {
      finish({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

export async function getKleinanzeigenStatus(config = {}) {
  const cliPath = normalizeOptionalString(config.cliPath) ?? "kleinanzeigen-bot";
  const configPath = resolveConfiguredConfigPath(config);
  const cwd =
    normalizeOptionalString(config.workingDirectory) ?? (configPath ? path.dirname(configPath) : undefined);
  const redactions = buildRedactions({ ...config, cliPath, workingDirectory: cwd, configPath });

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
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const versionResult = await runProcess(cliPath, ["version"], {
    cwd,
    timeoutMs: STATUS_TIMEOUT_MS,
    maxBufferChars: STATUS_OUTPUT_CHARS,
    env: buildChildEnv(),
  });
  const versionText = sanitizeText(
    [versionResult.stdout, versionResult.stderr, versionResult.error?.message].filter(Boolean).join("\n"),
    redactions,
    1000,
  );

  let helpResult = null;
  let helpText = "";
  if (!versionResult.error) {
    helpResult = await runProcess(cliPath, ["help"], {
      cwd,
      timeoutMs: STATUS_TIMEOUT_MS,
      maxBufferChars: STATUS_OUTPUT_CHARS,
      env: buildChildEnv(),
    });
    helpText = sanitizeText(
      [helpResult.stdout, helpResult.stderr, helpResult.error?.message].filter(Boolean).join("\n"),
      redactions,
      STATUS_OUTPUT_CHARS,
    );
  }

  return {
    ok: Boolean(versionResult.ok && helpResult?.ok && configFile.configured && configFile.isFile),
    operation: "status",
    executable: path.basename(cliPath),
    cwd: cwd ? "[redacted-path]" : null,
    configFile,
    workspaceMode: normalizeOptionalString(config.workspaceMode) ?? null,
    version: firstNonEmptyLine(versionText),
    commands: commandSupportFromHelp(helpText),
    exitCode: helpResult?.exitCode ?? versionResult.exitCode,
    signal: helpResult?.signal ?? versionResult.signal,
    timedOut: Boolean(versionResult.timedOut || helpResult?.timedOut),
    needsUserAction: false,
    stdout: "",
    stderr: versionResult.error || helpResult?.error ? firstNonEmptyLine(helpText || versionText) : "",
  };
}

export async function runKleinanzeigenOperation(operation, params = {}, config = {}) {
  const cliConfig = resolveCliConfig(config);
  await assertConfiguredFiles(cliConfig);
  const args = buildKleinanzeigenArgs(operation, params, cliConfig);
  const redactions = buildRedactions({ ...config, ...cliConfig });
  const result = await runProcess(cliConfig.cliPath, args, {
    cwd: cliConfig.cwd,
    timeoutMs: cliConfig.timeoutMs,
    maxBufferChars: cliConfig.maxOutputChars,
    env: buildChildEnv(),
  });
  const userAction = detectUserActionRequest(
    [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"),
  );

  const stdout = sanitizeText(result.stdout, redactions, cliConfig.maxOutputChars);
  const stderr = sanitizeText(
    result.error ? `${result.stderr}\n${result.error.message}` : result.stderr,
    redactions,
    cliConfig.maxOutputChars,
  );

  return {
    ok: result.ok,
    operation,
    command: {
      executable: path.basename(cliConfig.cliPath),
      args: redactArgs(args),
    },
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    needsUserAction: userAction.needsUserAction,
    ...(userAction.needsUserAction ? { userActionHint: userAction.userActionHint } : {}),
    stdout,
    stderr,
  };
}
