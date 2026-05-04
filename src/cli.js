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
  /\b(press (enter|a key)|when done|manual inspection|please solve|eof when reading a line|eoferror|captcha (present|detected|recognized|erkannt|vorhanden)|captcha erkannt|bitte lösen|eingabetaste drücken)\b/i;
const USER_ACTION_HINT = [
  "The local bot stopped or paused for an account check.",
  "Run it directly in a terminal/browser, finish that step, then retry this tool.",
].join(" ");
const STATUS_TIMEOUT_MS = 15000;
const STATUS_OUTPUT_CHARS = 3000;
const AD_FILE_NAMES = ["ad.yaml", "ad.yml", "ad.json"];

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeWorkspaceMode(value) {
  const mode = normalizeOptionalString(value) ?? "portable";
  if (!["portable", "xdg"].includes(mode)) {
    throw new Error("workspaceMode must be portable or xdg");
  }
  return mode;
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

function normalizeStringArray(value, name, { maxItems = 20 } = {}) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  const values = value.map((entry) => String(entry).trim()).filter(Boolean);
  if (values.length === 0) {
    throw new Error(`${name} must not be empty`);
  }
  if (values.length > maxItems) {
    throw new Error(`${name} must contain at most ${maxItems} entries`);
  }
  return [...new Set(values)];
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
  const workspaceMode = normalizeWorkspaceMode(config.workspaceMode);
  const lang = normalizeOptionalString(config.lang);

  if (!configPath) {
    throw new Error("plugin config must set configPath or workingDirectory");
  }
  args.push(`--config=${configPath}`);
  args.push("--logfile=");
  args.push(`--workspace-mode=${workspaceMode}`);
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
  const values = [];
  const add = (value) => {
    if (typeof value === "string" && value.trim()) {
      values.push(value.trim());
    }
  };

  add(config.cliPath);
  add(config.workingDirectory);
  add(config.configPath);
  for (const root of normalizeStringArray(config.adRoots, "adRoots", { maxItems: 50 })) {
    add(root);
  }
  if (typeof config.configPath === "string" && config.configPath.trim()) {
    const parent = path.dirname(config.configPath.trim());
    if (parent !== "." && parent !== path.parse(parent).root) {
      add(parent);
    }
  }

  return [...new Set(values)].sort((a, b) => b.length - a.length);
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
    workspaceMode: normalizeWorkspaceMode(config.workspaceMode),
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

async function realPath(value) {
  return fs.realpath(path.resolve(value));
}

function pathIsInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertInsideAdRoots(filePath, config = {}) {
  const configuredRoots = normalizeStringArray(config.adRoots, "adRoots", { maxItems: 50 });
  const fallbackRoots = [
    normalizeOptionalString(config.workingDirectory),
    normalizeOptionalString(config.configPath)
      ? path.dirname(normalizeOptionalString(config.configPath))
      : undefined,
  ].filter(Boolean);
  const roots = configuredRoots.length ? configuredRoots : fallbackRoots;
  if (!roots.length) {
    throw new Error("plugin config must set adRoots to use adConfigPaths or adDirectories");
  }

  const resolvedFile = await realPath(filePath);
  const resolvedRoots = await Promise.all(roots.map((root) => realPath(root)));
  if (!resolvedRoots.some((root) => pathIsInside(resolvedFile, root))) {
    throw new Error("ad config path is outside configured adRoots");
  }
  return resolvedFile;
}

async function resolveAdConfigInDirectory(directory) {
  for (const filename of AD_FILE_NAMES) {
    const candidate = path.join(directory, filename);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  throw new Error(`ad directory has no ad.yaml, ad.yml, or ad.json: ${directory}`);
}

function stripYamlScalar(value) {
  const withoutComment = String(value ?? "").replace(/\s+#.*$/, "").trim();
  if (
    (withoutComment.startsWith('"') && withoutComment.endsWith('"')) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}

function parseAdSummary(text) {
  const summary = {
    active: null,
    id: null,
    title: "",
    price: null,
    category: "",
    imageGlobs: [],
  };
  let inImages = false;

  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.trimEnd();
    const topLevel = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (topLevel) {
      inImages = topLevel[1] === "images";
      const value = stripYamlScalar(topLevel[2]);
      if (topLevel[1] === "active") {
        summary.active = value === "true" ? true : value === "false" ? false : null;
      } else if (topLevel[1] === "id") {
        summary.id = value || null;
      } else if (topLevel[1] === "title") {
        summary.title = value;
      } else if (topLevel[1] === "price") {
        summary.price = value || null;
      } else if (topLevel[1] === "category") {
        summary.category = value;
      }
      continue;
    }

    const imageEntry = inImages ? /^\s*-\s*(.+?)\s*$/.exec(line) : null;
    if (imageEntry) {
      const imageGlob = stripYamlScalar(imageEntry[1]);
      if (imageGlob && !imageGlob.startsWith("#")) {
        summary.imageGlobs.push(imageGlob);
      }
    }
  }

  return summary;
}

function displayPathForAd(filePath, root) {
  const relative = path.relative(root, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative
    : path.basename(filePath);
}

async function findAdFiles(root, { maxDepth = 4, maxFiles = 200 } = {}) {
  const found = [];
  async function visit(directory, depth) {
    if (found.length >= maxFiles || depth > maxDepth) {
      return;
    }

    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const filename of AD_FILE_NAMES) {
      if (entries.some((entry) => entry.isFile() && entry.name === filename)) {
        found.push(path.join(directory, filename));
        break;
      }
    }
    if (depth === maxDepth) {
      return;
    }

    for (const entry of entries) {
      if (found.length >= maxFiles) {
        return;
      }
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        await visit(path.join(directory, entry.name), depth + 1);
      }
    }
  }

  await visit(root, 0);
  return found;
}

async function readConfiguredAdFiles(configPath) {
  const resolvedConfigPath = normalizeOptionalString(configPath);
  if (!resolvedConfigPath) {
    return [];
  }

  const configDir = path.dirname(resolvedConfigPath);
  const text = await fs.readFile(resolvedConfigPath, "utf8");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^ad_files\s*:/.test(line));
  if (start === -1) {
    return [];
  }

  const adFiles = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) && !line.startsWith("#")) {
      break;
    }
    const match = /^\s*-\s*(.+?)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const value = stripYamlScalar(match[1]);
    if (!value || /[*?[{]/.test(value)) {
      continue;
    }
    adFiles.push(path.isAbsolute(value) ? value : path.resolve(configDir, value));
  }

  return [...new Set(adFiles)];
}

async function findTitleLengthCandidates(config = {}, { limit = 65, maxResults = 10 } = {}) {
  const roots = normalizeStringArray(config.adRoots, "adRoots", { maxItems: 50 });
  const configuredAdFiles = await readConfiguredAdFiles(config.configPath);
  const configuredExisting = [];
  for (const adConfigPath of configuredAdFiles) {
    try {
      const stat = await fs.stat(adConfigPath);
      if (stat.isFile()) {
        configuredExisting.push(await realPath(adConfigPath));
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (configuredExisting.length) {
    const resolvedRoots = await Promise.all(roots.map((entry) => realPath(entry)));
    const fallbackRoot = path.dirname(await realPath(config.configPath));
    const candidates = [];
    for (const adConfigPath of configuredExisting) {
      const text = await fs.readFile(adConfigPath, "utf8");
      const summary = parseAdSummary(text);
      if (summary.title.length <= limit) {
        continue;
      }
      const displayRoot =
        resolvedRoots.find((root) => pathIsInside(adConfigPath, root)) ?? fallbackRoot;
      candidates.push({
        adPath: displayPathForAd(adConfigPath, displayRoot),
        title: summary.title,
        titleLength: summary.title.length,
        limit,
      });
      if (candidates.length >= maxResults) {
        return candidates;
      }
    }
    return candidates;
  }

  if (!roots.length) {
    return [];
  }

  const candidates = [];
  for (const root of await Promise.all(roots.map((entry) => realPath(entry)))) {
    for (const adConfigPath of await findAdFiles(root, { maxFiles: 400 })) {
      const text = await fs.readFile(adConfigPath, "utf8");
      const summary = parseAdSummary(text);
      if (summary.title.length > limit) {
        candidates.push({
          adPath: displayPathForAd(adConfigPath, root),
          title: summary.title,
          titleLength: summary.title.length,
          limit,
        });
        if (candidates.length >= maxResults) {
          return candidates;
        }
      }
    }
  }
  return candidates;
}

export async function listKleinanzeigenAds(config = {}, params = {}) {
  const roots = normalizeStringArray(config.adRoots, "adRoots", { maxItems: 50 });
  if (!roots.length) {
    throw new Error("plugin config must set adRoots to list ads");
  }
  const query = normalizeOptionalString(params.query)?.toLowerCase();
  const maxResults = normalizePositiveInteger(params.maxResults, 50, 1, 200);
  const resolvedRoots = await Promise.all(roots.map((root) => realPath(root)));
  const ads = [];

  for (const root of resolvedRoots) {
    for (const adConfigPath of await findAdFiles(root, { maxFiles: maxResults * 4 })) {
      const directory = path.dirname(adConfigPath);
      const relDir = path.relative(root, directory);
      const text = await fs.readFile(adConfigPath, "utf8");
      const summary = parseAdSummary(text);
      const haystack = [
        relDir,
        path.basename(directory),
        summary.id,
        summary.title,
        summary.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (query && !haystack.includes(query)) {
        continue;
      }
      ads.push({
        root,
        directory,
        relativeDirectory: relDir,
        adConfigPath,
        ...summary,
      });
      if (ads.length >= maxResults) {
        return { ok: true, operation: "list_ads", count: ads.length, ads };
      }
    }
  }

  return { ok: true, operation: "list_ads", count: ads.length, ads };
}

export async function extractKleinanzeigenDiagnostics(text, config = {}) {
  const diagnostics = [];
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  let target = "";

  for (const line of lines) {
    const validationHeader = /\[ERROR\]\s+\d+\s+validation error for \[(.+?)\]:/.exec(line);
    if (validationHeader) {
      target = validationHeader[1];
      continue;
    }

    const validationLine = /^-\s*([A-Za-z0-9_.-]+):\s*(.+)$/.exec(line.trim());
    if (!validationLine || !target) {
      continue;
    }

    const field = validationLine[1];
    const message = validationLine[2].trim();
    const diagnostic = {
      severity: "error",
      kind: target.includes("AdPartial") ? "ad_validation" : "config_validation",
      field,
      message,
      suggestedAction: target.includes("AdPartial")
        ? "fix the invalid ad or run a scoped operation for a different ad"
        : "fix the bot config and rerun verify",
    };

    if (/title length exceeds 65 characters/i.test(message)) {
      const candidates = await findTitleLengthCandidates(config, { limit: 65 });
      if (candidates.length) {
        diagnostic.candidates = candidates;
        if (candidates.length === 1) {
          diagnostic.adPath = candidates[0].adPath;
          diagnostic.title = candidates[0].title;
          diagnostic.titleLength = candidates[0].titleLength;
          diagnostic.limit = candidates[0].limit;
        }
      }
    }

    diagnostics.push(diagnostic);
  }

  return diagnostics;
}

function buildNextActions(diagnostics = [], scoped) {
  if (!diagnostics.length) {
    return [];
  }
  if (diagnostics.some((entry) => entry.kind === "config_validation")) {
    return ["fix the bot config and rerun kleinanzeigen_verify"];
  }
  if (scoped) {
    return ["fix the selected ad config and rerun scoped kleinanzeigen_verify"];
  }
  return [
    "use kleinanzeigen_list_ads to find the target ad",
    "use kleinanzeigen_verify with adDirectories or adConfigPaths for one ad",
    "fix invalid ads before unscoped verify or bulk publish",
  ];
}

async function resolveScopedAdConfigPaths(params = {}, config = {}) {
  const adConfigPaths = normalizeStringArray(params.adConfigPaths, "adConfigPaths");
  const adDirectories = normalizeStringArray(params.adDirectories, "adDirectories");
  if (!adConfigPaths.length && !adDirectories.length) {
    return [];
  }

  const resolved = [];
  for (const adConfigPath of adConfigPaths) {
    const stat = await fs.stat(adConfigPath);
    if (!stat.isFile()) {
      throw new Error(`adConfigPaths entry is not a file: ${adConfigPath}`);
    }
    resolved.push(await assertInsideAdRoots(adConfigPath, config));
  }
  for (const directory of adDirectories) {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) {
      throw new Error(`adDirectories entry is not a directory: ${directory}`);
    }
    resolved.push(await assertInsideAdRoots(await resolveAdConfigInDirectory(directory), config));
  }
  return [...new Set(resolved)];
}

function replaceYamlAdFiles(content, adConfigPaths) {
  const replacement = [
    "ad_files:",
    ...adConfigPaths.map((adConfigPath) => `  - ${JSON.stringify(adConfigPath)}`),
  ];
  const lines = String(content ?? "").replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^ad_files\s*:/.test(line));
  if (start === -1) {
    return [...replacement, "", ...lines].join("\n");
  }

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (/^\S/.test(line) && !line.startsWith("#")) {
      break;
    }
    end += 1;
  }

  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
}

async function createScopedConfig(cliConfig, adConfigPaths) {
  if (!adConfigPaths.length) {
    return { config: cliConfig, cleanup: async () => {} };
  }

  const original = await fs.readFile(cliConfig.configPath, "utf8");
  const ext = path.extname(cliConfig.configPath).toLowerCase();
  const scoped =
    ext === ".json"
      ? JSON.stringify({ ...JSON.parse(original), ad_files: adConfigPaths }, null, 2)
      : replaceYamlAdFiles(original, adConfigPaths);
  const configDir = path.dirname(cliConfig.configPath);
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const configPath = path.join(configDir, `.kleinclaw-${suffix}${ext === ".json" ? ".json" : ".yaml"}`);
  await fs.writeFile(configPath, scoped, { encoding: "utf8", mode: 0o600 });

  return {
    config: { ...cliConfig, configPath, cwd: configDir },
    cleanup: () => fs.rm(configPath, { force: true }),
  };
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
    workspaceMode: normalizeWorkspaceMode(config.workspaceMode),
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
  const baseCliConfig = resolveCliConfig(config);
  const scopedAdConfigPaths = await resolveScopedAdConfigPaths(params, config);
  const scopedConfig = await createScopedConfig(baseCliConfig, scopedAdConfigPaths);
  const cliConfig = scopedConfig.config;
  await assertConfiguredFiles(cliConfig);
  let args;
  let result;
  try {
    args = buildKleinanzeigenArgs(operation, params, cliConfig);
    result = await runProcess(cliConfig.cliPath, args, {
      cwd: cliConfig.cwd,
      timeoutMs: cliConfig.timeoutMs,
      maxBufferChars: cliConfig.maxOutputChars,
      env: buildChildEnv(),
    });
  } finally {
    await scopedConfig.cleanup();
  }
  const redactions = buildRedactions({ ...config, ...cliConfig });
  const userAction = detectUserActionRequest(
    [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"),
  );

  const stdout = sanitizeText(result.stdout, redactions, cliConfig.maxOutputChars);
  const stderr = sanitizeText(
    result.error ? `${result.stderr}\n${result.error.message}` : result.stderr,
    redactions,
    cliConfig.maxOutputChars,
  );
  const diagnostics = await extractKleinanzeigenDiagnostics(
    [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"),
    config,
  );
  const nextActions = buildNextActions(diagnostics, scopedAdConfigPaths.length > 0);

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
    ...(diagnostics.length ? { diagnostics, nextActions } : {}),
    stdout,
    stderr,
  };
}
