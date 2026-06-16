import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OPERATIONS = Object.freeze({
  verify: { command: "verify", sideEffect: false },
  diagnose: { command: "diagnose", sideEffect: false },
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
const SENSITIVE_LINE_RE = new RegExp(
  [
    "\\b(",
    "password|passwd|username|login|cookie|session|token|secret|credential",
    "|2fa|sms|user[_-]?data[_-]?dir|profile_name|browser profile",
    ")\\b",
  ].join(""),
  "i",
);
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const USER_ACTION_RE = new RegExp(
  [
    "\\b(",
    "press (enter|a key)|when done|manual inspection|please solve",
    "|eof when reading a line|eoferror",
    "|captcha (present|detected|recognized|erkannt|vorhanden)",
    "|captcha erkannt|bitte lösen|eingabetaste drücken",
    ")\\b",
  ].join(""),
  "i",
);
const USER_ACTION_HINT = [
  "The miniclaw runtime stopped or paused for an account check.",
  "Run it directly in a terminal/browser, finish that step, then retry this tool.",
].join(" ");
const STATUS_TIMEOUT_MS = 15000;
const STATUS_OUTPUT_CHARS = 3000;
const AD_FILE_NAMES = ["ad.yaml", "ad.yml", "ad.json"];
const DRAFT_AD_FILE_NAMES = ["ad.yaml", "ad.yml"];
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".gif", ".jpg", ".jpeg", ".png"]);
const IMAGE_FILE_EXTENSIONS = new Set([...SUPPORTED_IMAGE_EXTENSIONS, ".webp", ".avif", ".heic"]);
const AD_TITLE_MIN_LENGTH = 10;
const AD_TITLE_MAX_LENGTH = 65;
const AD_DESCRIPTION_MAX_LENGTH = 4000;
const PRICE_TYPES = ["FIXED", "NEGOTIABLE", "GIVE_AWAY", "NOT_APPLICABLE"];
const AD_TYPES = ["OFFER", "WANTED"];
const SHIPPING_TYPES = ["PICKUP", "SHIPPING", "NOT_APPLICABLE"];
const SHIPPING_OPTIONS = [
  "DHL_2",
  "Hermes_Päckchen",
  "Hermes_S",
  "DHL_5",
  "Hermes_M",
  "DHL_10",
  "DHL_20",
  "DHL_31,5",
  "Hermes_L",
];
const CONDITION_VALUES = ["new", "like_new", "ok", "alright", "defect"];
const MINICLAW_DEFAULT_BROWSER_ORDER = [
  "chromium",
  "chromium-browser",
  "google-chrome",
  "microsoft-edge",
];
const EMBEDDED_MINICLAW_CLI = fileURLToPath(
  new URL("../miniclaw/dist/cli.js", import.meta.url),
);
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
const SUPPORTED_BROWSER_IDS = Object.freeze(
  Object.entries(BROWSER_CHOICES)
    .filter(([, choice]) => choice.supportedByMiniclaw)
    .map(([id]) => id),
);
const BROWSER_COMMAND_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.entries(BROWSER_CHOICES).flatMap(([id, choice]) =>
      choice.commands.map((command) => [command, id]),
    ),
  ),
);

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

function embeddedMiniclawRuntime() {
  return {
    argsPrefix: [EMBEDDED_MINICLAW_CLI],
    command: process.execPath,
    label: "miniclaw",
  };
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
  if (spec.sideEffect) {
    args.push("--allow-live-browser");
  }

  args.push(spec.command);

  if (["verify", "diagnose"].includes(operation)) {
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

  add(config.workingDirectory);
  add(config.configPath);
  if (config.runtime) {
    add(config.runtime.command);
    for (const arg of config.runtime.argsPrefix ?? []) {
      add(arg);
    }
  }
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
  const configuredConfigPath = normalizeOptionalString(config.configPath);
  const configuredCwd = normalizeOptionalString(config.workingDirectory);
  const configPath =
    configuredConfigPath ?? (configuredCwd ? path.join(configuredCwd, "config.yaml") : undefined);
  if (!configPath) {
    throw new Error("plugin config must set configPath or workingDirectory");
  }
  const cwd = configuredCwd ?? path.dirname(configPath);

  return {
    cwd,
    configPath,
    runtime: embeddedMiniclawRuntime(),
    workspaceMode: normalizeWorkspaceMode(config.workspaceMode),
    lang: normalizeOptionalString(config.lang),
    timeoutMs: normalizePositiveInteger(config.timeoutMs, 120000, 1000, 600000),
    maxOutputChars: normalizePositiveInteger(config.maxOutputChars, 6000, 0, 20000),
    commandRunner: typeof config.commandRunner === "function" ? config.commandRunner : undefined,
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
      throw new Error("configured miniclaw config is not a file");
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("configured miniclaw config was not found");
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

async function configuredAdRoots(config = {}) {
  const roots = normalizeStringArray(config.adRoots, "adRoots", { maxItems: 50 });
  if (!roots.length) {
    throw new Error("plugin config must set adRoots for ad authoring tools");
  }

  const resolved = [];
  for (const root of roots) {
    const realRoot = await realPath(root);
    const stat = await fs.stat(realRoot);
    if (!stat.isDirectory()) {
      throw new Error("configured adRoot is not a directory");
    }
    resolved.push(realRoot);
  }
  return resolved;
}

async function nearestExistingParent(candidate) {
  let current = path.resolve(candidate);
  for (;;) {
    try {
      const stat = await fs.stat(current);
      if (stat.isDirectory()) {
        return current;
      }
      return path.dirname(current);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error("no existing parent directory found");
      }
      current = parent;
    }
  }
}

async function resolveWritableAdDirectory(directory, config = {}) {
  const roots = await configuredAdRoots(config);
  const rawDirectory = normalizeOptionalString(directory);
  if (!rawDirectory) {
    throw new Error("directory is required");
  }

  const candidate = path.isAbsolute(rawDirectory)
    ? path.resolve(rawDirectory)
    : path.resolve(roots[0], rawDirectory);
  const parent = await nearestExistingParent(candidate);
  const resolvedParent = await realPath(parent);
  const matchingRoot = roots.find((root) => pathIsInside(resolvedParent, root));
  if (!matchingRoot || !pathIsInside(candidate, matchingRoot)) {
    throw new Error("directory is outside configured adRoots");
  }

  return { directory: candidate, root: matchingRoot };
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
  throw new Error("ad directory has no ad.yaml, ad.yml, or ad.json");
}

function stripYamlScalar(value) {
  const raw = String(value ?? "").trim();
  const withoutComment = raw.startsWith("#") ? "" : raw.replace(/\s+#.*$/, "").trim();
  if (
    (withoutComment.startsWith('"') && withoutComment.endsWith('"')) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}

function quoteYamlScalar(value) {
  return JSON.stringify(String(value ?? ""));
}

function snakeCaseKey(key) {
  return String(key).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function normalizeObject(value, name) {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function normalizeAdDraftString(value, name, { required = false, maxLength } = {}) {
  if (value === undefined) {
    if (required) {
      throw new Error(`${name} is required`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  const next = value.trim();
  if (required && !next) {
    throw new Error(`${name} must not be empty`);
  }
  if (maxLength !== undefined && next.length > maxLength) {
    throw new Error(`${name} length exceeds ${maxLength} characters`);
  }
  return next;
}

function normalizeEnum(value, name, allowed) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

function normalizeNumber(value, name, { integer = false, min } = {}) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  if (min !== undefined && value < min) {
    throw new Error(`${name} must be at least ${min}`);
  }
  return value;
}

function normalizeStringMap(value, name) {
  const object = normalizeObject(value, name);
  if (object === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(object)
      .filter(([key, entry]) => String(key).trim() && entry !== undefined && entry !== null)
      .map(([key, entry]) => [String(key).trim(), String(entry).trim()]),
  );
}

function rejectUnsafeRelativePattern(value, name) {
  const pattern = normalizeAdDraftString(value, name, { required: true });
  if (path.isAbsolute(pattern) || pattern.split(/[\\/]/).includes("..")) {
    throw new Error(`${name} must be relative to the ad directory`);
  }
  return pattern;
}

function yamlScalar(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (typeof value === "boolean" || typeof value === "number") {
    return `${value}`;
  }
  if (value === null) {
    return "";
  }
  const text = String(value ?? "");
  if (text.includes("\n")) {
    const lines = text.split("\n");
    return `|\n${lines.map((line) => `${pad}  ${line}`).join("\n")}`;
  }
  return quoteYamlScalar(text);
}

function yamlLinesForEntry(key, value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) {
      return [`${pad}${key}: []`];
    }
    return [
      `${pad}${key}:`,
      ...value.map((entry) => `${pad}  - ${yamlScalar(entry, indent + 2)}`),
    ];
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
    if (!entries.length) {
      return [`${pad}${key}: {}`];
    }
    return [
      `${pad}${key}:`,
      ...entries.flatMap(([childKey, entry]) =>
        yamlLinesForEntry(snakeCaseKey(childKey), entry, indent + 2),
      ),
    ];
  }
  return [`${pad}${key}: ${yamlScalar(value, indent)}`];
}

function renderAdYaml(ad) {
  const schemaRef = "miniclaw://schemas/ad.schema.json";
  const order = [
    "active",
    "type",
    "title",
    "description",
    "descriptionPrefix",
    "descriptionSuffix",
    "category",
    "specialAttributes",
    "price",
    "priceType",
    "autoPriceReduction",
    "shippingType",
    "shippingCosts",
    "shippingOptions",
    "sellDirectly",
    "images",
    "contact",
    "republicationInterval",
  ];
  const lines = [
    `# yaml-language-server: $schema=${schemaRef}`,
  ];

  for (const key of order) {
    if (ad[key] !== undefined) {
      lines.push(...yamlLinesForEntry(snakeCaseKey(key), ad[key]));
    }
  }
  return `${lines.join("\n")}\n`;
}

function sanitizeAdYaml(text, { includeContact = false } = {}) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const sanitized = [];
  let inContact = false;

  for (const line of lines) {
    if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(line)) {
      inContact = /^contact\s*:/.test(line);
      sanitized.push(line);
      continue;
    }
    if (!includeContact && inContact && /^\s+[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(line)) {
      sanitized.push(line.replace(/:\s*.*$/, ": [redacted-contact]"));
      continue;
    }
    sanitized.push(line);
  }
  return sanitized.join("\n").trim();
}

function setYamlTopLevelActive(text, active) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const nextLine = `active: ${active ? "true" : "false"}`;
  const activeIndex = lines.findIndex((line) => /^active\s*:/.test(line));
  if (activeIndex !== -1) {
    const next = [...lines];
    next[activeIndex] = nextLine;
    return next.join("\n");
  }

  let insertAt = 0;
  while (
    insertAt < lines.length &&
    (lines[insertAt].trim() === "" || lines[insertAt].trimStart().startsWith("#"))
  ) {
    insertAt += 1;
  }

  const next = [...lines];
  next.splice(insertAt, 0, nextLine);
  return next.join("\n");
}

function findTopLevelYamlSection(lines, key) {
  const start = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));
  if (start === -1) {
    return null;
  }

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(line)) {
      break;
    }
    end += 1;
  }
  return { start, end };
}

function parseBrowserConfigText(text) {
  const config = {
    arguments: [],
    binary_location: "",
    use_private_window: true,
    user_data_dir: "",
    profile_name: "",
  };
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const section = findTopLevelYamlSection(lines, "browser");
  if (!section) {
    return { ...config, configured: false };
  }

  let currentKey = "";
  for (let index = section.start + 1; index < section.end; index += 1) {
    const line = lines[index];
    const direct = /^\s+([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (direct) {
      currentKey = direct[1];
      const value = stripYamlScalar(direct[2]);
      if (currentKey === "binary_location") {
        config.binary_location = value;
      } else if (currentKey === "use_private_window") {
        config.use_private_window = value === "true";
      } else if (currentKey === "user_data_dir") {
        config.user_data_dir = value;
      } else if (currentKey === "profile_name") {
        config.profile_name = value;
      } else if (currentKey === "arguments" && value === "[]") {
        config.arguments = [];
      }
      continue;
    }

    const listEntry = currentKey === "arguments" ? /^\s+-\s*(.+?)\s*$/.exec(line) : null;
    if (listEntry) {
      const value = stripYamlScalar(listEntry[1]);
      if (value) {
        config.arguments.push(value);
      }
    }
  }

  return { ...config, configured: true };
}

function normalizeBrowserName(value) {
  const browser = normalizeOptionalString(value);
  if (browser === undefined) {
    return undefined;
  }
  if (browser !== "auto" && !SUPPORTED_BROWSER_IDS.includes(browser)) {
    throw new Error(
      `browser must be one of: auto, ${SUPPORTED_BROWSER_IDS.join(", ")}`,
    );
  }
  return browser;
}

function normalizeBoolean(value, name) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

function normalizeProfileMode(value) {
  const mode = normalizeOptionalString(value);
  if (mode === undefined) {
    return undefined;
  }
  if (!["workspace", "system-default", "custom"].includes(mode)) {
    throw new Error("profileMode must be workspace, system-default, or custom");
  }
  return mode;
}

function normalizeOptionalPathSetting(value, name) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value.trim();
}

function assertSafeBrowserConfigureParams(params = {}) {
  const forbidden = [
    "binaryLocation",
    "allowUnsupportedBrowser",
    "userDataDir",
  ].filter((key) => params[key] !== undefined);
  if (forbidden.length > 0) {
    throw new Error(
      `${forbidden.join(", ")} cannot be changed through browser_configure; ` +
        "edit the local miniclaw config outside OpenClaw",
    );
  }
  if (params.profileMode === "custom") {
    throw new Error(
      "profileMode custom cannot be persisted through browser_configure; " +
        "edit the local miniclaw config outside OpenClaw",
    );
  }
  if (params.profileName !== undefined && params.profileMode !== "system-default") {
    throw new Error("profileName requires profileMode system-default");
  }
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function browserSearchPaths(sourceEnv = process.env) {
  return uniqueValues([
    ...(sourceEnv.PATH ? sourceEnv.PATH.split(path.delimiter) : []),
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/brave-bin",
  ]);
}

async function fileIsExecutable(filePath) {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(command, sourceEnv = process.env) {
  if (!command) {
    return null;
  }
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

function inferBrowserIdFromExecutable(executable) {
  const lower = path.basename(String(executable ?? "")).toLowerCase().replace(/\.exe$/, "");
  if (Object.hasOwn(BROWSER_COMMAND_ALIASES, lower)) {
    return BROWSER_COMMAND_ALIASES[lower];
  }
  const full = String(executable ?? "").toLowerCase();
  if (full.includes("brave")) {
    return "brave";
  }
  if (full.includes("chromium")) {
    return "chromium";
  }
  if (full.includes("chrome")) {
    return "google-chrome";
  }
  if (full.includes("edge") || full.includes("msedge")) {
    return "microsoft-edge";
  }
  return null;
}

async function browserVersion(executable, commandRunner) {
  if (!executable) {
    return "";
  }
  const result = await runProcess(executable, ["--version"], {
    timeoutMs: 4000,
    maxBufferChars: 500,
    env: buildChildEnv(),
    commandRunner,
  });
  return firstNonEmptyLine([result.stdout, result.stderr].filter(Boolean).join("\n"));
}

async function detectInstalledBrowsers({ sourceEnv = process.env, commandRunner } = {}) {
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
      miniclawAutoDefault: choice.commands.some((command) =>
        MINICLAW_DEFAULT_BROWSER_ORDER.includes(command),
      ),
    });
  }
  return detected;
}

function effectiveMiniclawAutoBrowser(detectedBrowsers) {
  for (const command of MINICLAW_DEFAULT_BROWSER_ORDER) {
    const browser = detectedBrowsers.find((entry) => entry.commands.includes(command));
    if (browser?.installed) {
      return browser;
    }
  }
  return null;
}

function displayBrowserPath(filePath, baseDir) {
  if (!filePath) {
    return "";
  }
  const resolved = path.resolve(baseDir, filePath);
  const relative = path.relative(baseDir, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return relative || ".";
  }
  return `[redacted-path]/${path.basename(resolved)}`;
}

function redactBrowserArgument(argument, baseDir) {
  const match = /^--user-data-dir=(.*)$/.exec(argument);
  if (!match) {
    return argument;
  }
  return `--user-data-dir=${displayBrowserPath(match[1].replace(/^["']|["']$/g, ""), baseDir)}`;
}

function profileDirForBrowser(browser) {
  const choice = BROWSER_CHOICES[browser];
  if (!choice) {
    return "";
  }
  return path.join(os.homedir(), ...choice.profileDir);
}

function buildBrowserStatusPayload({ cliConfig, browserConfig, detectedBrowsers }) {
  const autoBrowser = effectiveMiniclawAutoBrowser(detectedBrowsers);
  const configuredBinaryLocation = browserConfig.binary_location;
  const configuredBrowser = configuredBinaryLocation
    ? inferBrowserIdFromExecutable(configuredBinaryLocation)
    : "auto";
  const effectiveBrowser = configuredBinaryLocation
    ? detectedBrowsers.find((entry) => entry.id === configuredBrowser) ?? {
        id: configuredBrowser,
        executable: configuredBinaryLocation,
      }
    : autoBrowser;
  const expectedWorkspaceProfileDir =
    !browserConfig.user_data_dir && cliConfig.workspaceMode === "portable"
      ? path.join(cliConfig.cwd, ".temp", "browser-profile")
      : "";

  return {
    ok: true,
    operation: "browser_status",
    configFile: {
      configured: true,
      exists: true,
      isFile: true,
    },
    browser: {
      supportedChoices: ["auto", ...SUPPORTED_BROWSER_IDS],
      configured: {
        browser: configuredBrowser,
        binaryLocation: configuredBinaryLocation,
        usePrivateWindow: browserConfig.use_private_window,
        userDataDir: displayBrowserPath(browserConfig.user_data_dir, cliConfig.cwd),
        profileName: browserConfig.profile_name,
        arguments: browserConfig.arguments.map((entry) =>
          redactBrowserArgument(entry, cliConfig.cwd),
        ),
      },
      effective: {
        browser: effectiveBrowser?.id ?? null,
        binaryLocation: configuredBinaryLocation || autoBrowser?.executable || "",
        usePrivateWindow: browserConfig.use_private_window,
        userDataDir: displayBrowserPath(
          browserConfig.user_data_dir || expectedWorkspaceProfileDir,
          cliConfig.cwd,
        ),
        profileName: browserConfig.profile_name || "Default",
      },
      notes: configuredBinaryLocation
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

function scalarBrowserLine(indent, key, value) {
  const rendered = typeof value === "boolean" ? String(value) : quoteYamlScalar(value);
  return `${indent}${key}: ${rendered}`;
}

function replaceBrowserYaml(content, updates) {
  const normalized = String(content ?? "").replace(/\r\n/g, "\n");
  const hadTrailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (hadTrailingNewline) {
    lines.pop();
  }

  let section = findTopLevelYamlSection(lines, "browser");
  if (!section) {
    lines.push(
      "",
      "browser:",
      "  arguments: []",
      "  binary_location: \"\"",
      "  extensions: []",
      "  use_private_window: true",
      "  user_data_dir: \"\"",
      "  profile_name: \"\"",
    );
    section = findTopLevelYamlSection(lines, "browser");
  }

  const existingChild = lines
    .slice(section.start + 1, section.end)
    .map((line) => /^(\s+)[A-Za-z_][A-Za-z0-9_-]*\s*:/.exec(line)?.[1])
    .find(Boolean);
  const indent = existingChild ?? "  ";

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }

    let replaced = false;
    for (let index = section.start + 1; index < section.end; index += 1) {
      if (new RegExp(`^\\s+${key}\\s*:`).test(lines[index])) {
        lines[index] = scalarBrowserLine(indent, key, value);
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      lines.splice(section.end, 0, scalarBrowserLine(indent, key, value));
      section.end += 1;
    }
  }

  return `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`;
}

async function writeFileAtomic(filePath, content, mode) {
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath);
  const tmp = path.join(directory, `.${basename}.kleinclaw-${process.pid}-${Date.now()}.tmp`);
  try {
    await fs.writeFile(tmp, content, { encoding: "utf8", mode });
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

async function resolveBrowserUpdates(params = {}, cliConfig, currentBrowserConfig) {
  if (params.confirm !== true) {
    throw new Error("confirm must be true before changing browser config");
  }

  const browser = normalizeBrowserName(params.browser);
  const binaryLocation = normalizeOptionalPathSetting(params.binaryLocation, "binaryLocation");
  const userDataDir = normalizeOptionalPathSetting(params.userDataDir, "userDataDir");
  const profileName = normalizeOptionalPathSetting(params.profileName, "profileName");
  const profileMode = normalizeProfileMode(params.profileMode);
  const allowUnsupportedBrowser =
    normalizeBoolean(params.allowUnsupportedBrowser, "allowUnsupportedBrowser") ?? false;
  const updates = {};

  if (browser && binaryLocation) {
    throw new Error("browser cannot be combined with binaryLocation");
  }

  if (browser === "auto") {
    updates.binary_location = "";
  } else if (browser) {
    const executable = await resolveBrowserChoice(browser);
    if (!executable) {
      throw new Error(`${BROWSER_CHOICES[browser].label} executable was not found on PATH`);
    }
    updates.binary_location = executable;
  } else if (binaryLocation !== undefined) {
    if (!binaryLocation) {
      throw new Error("binaryLocation must not be empty");
    }
    const executable = path.resolve(cliConfig.cwd, binaryLocation);
    if (!(await fileIsExecutable(executable))) {
      throw new Error("binaryLocation does not point to an executable file");
    }
    const inferredBrowser = inferBrowserIdFromExecutable(executable);
    const browserChoice = inferredBrowser ? BROWSER_CHOICES[inferredBrowser] : null;
    if (!browserChoice?.supportedByMiniclaw && !allowUnsupportedBrowser) {
      throw new Error(
        "binaryLocation is not a supported miniclaw browser; " +
          "set allowUnsupportedBrowser true to try it as a custom Chromium-family executable",
      );
    }
    updates.binary_location = executable;
  }

  if (params.usePrivateWindow !== undefined) {
    updates.use_private_window = normalizeBoolean(params.usePrivateWindow, "usePrivateWindow");
  }

  if (profileMode === "workspace") {
    updates.user_data_dir = "";
    updates.profile_name = "";
  } else if (profileMode === "system-default") {
    const effectiveBinary = updates.binary_location ?? currentBrowserConfig.binary_location;
    const effectiveBrowser =
      browser && browser !== "auto"
        ? browser
        : inferBrowserIdFromExecutable(effectiveBinary) ?? inferBrowserIdFromExecutable(
            effectiveMiniclawAutoBrowser(
              await detectInstalledBrowsers({ commandRunner: cliConfig.commandRunner }),
            )?.executable,
          );
    const profileDir = profileDirForBrowser(effectiveBrowser);
    if (!profileDir) {
      throw new Error("profileMode system-default needs a known browser choice");
    }
    updates.user_data_dir = profileDir;
    updates.profile_name = profileName ?? "";
  } else if (profileMode === "custom") {
    if (userDataDir === undefined || !userDataDir) {
      throw new Error("profileMode custom requires userDataDir");
    }
    updates.user_data_dir = path.resolve(cliConfig.cwd, userDataDir);
    if (profileName !== undefined) {
      updates.profile_name = profileName;
    }
  } else {
    if (userDataDir !== undefined) {
      updates.user_data_dir = userDataDir ? path.resolve(cliConfig.cwd, userDataDir) : "";
    }
    if (profileName !== undefined) {
      updates.profile_name = profileName;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("provide at least one browser setting to change");
  }

  return updates;
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

function parseAdOperationState(text, filePath = "") {
  if (path.extname(filePath).toLowerCase() === ".json") {
    try {
      const parsed = JSON.parse(text);
      return {
        id: parsed.id ? String(parsed.id) : null,
        title: typeof parsed.title === "string" ? parsed.title : "",
        updatedOn: typeof parsed.updated_on === "string" ? parsed.updated_on : "",
        createdOn: typeof parsed.created_on === "string" ? parsed.created_on : "",
        contentHash: typeof parsed.content_hash === "string" ? parsed.content_hash : "",
        repostCount: Number.isInteger(parsed.repost_count) ? parsed.repost_count : null,
      };
    } catch {
      return { id: null, title: "", updatedOn: "", createdOn: "", contentHash: "", repostCount: null };
    }
  }

  const state = {
    id: null,
    title: "",
    updatedOn: "",
    createdOn: "",
    contentHash: "",
    repostCount: null,
  };

  for (const rawLine of String(text ?? "").split("\n")) {
    const topLevel = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(rawLine.trimEnd());
    if (!topLevel) {
      continue;
    }
    const key = topLevel[1];
    const value = stripYamlScalar(topLevel[2]);
    if (key === "id") {
      state.id = value || null;
    } else if (key === "title") {
      state.title = value;
    } else if (key === "updated_on") {
      state.updatedOn = value;
    } else if (key === "created_on") {
      state.createdOn = value;
    } else if (key === "content_hash") {
      state.contentHash = value;
    } else if (key === "repost_count") {
      state.repostCount = /^\d+$/.test(value) ? Number(value) : null;
    }
  }

  return state;
}

async function readAdOperationSnapshots(adConfigPaths = [], config = {}) {
  const roots = normalizeStringArray(config.adRoots, "adRoots", { maxItems: 50 });
  const resolvedRoots = roots.length
    ? await Promise.all(
        roots.map(async (entry) => realPath(entry).catch(() => null)),
      )
    : [];
  const snapshots = [];

  for (const adConfigPath of adConfigPaths) {
    try {
      const text = await fs.readFile(adConfigPath, "utf8");
      const displayRoot =
        resolvedRoots.find((root) => root && pathIsInside(adConfigPath, root)) ??
        path.dirname(adConfigPath);
      snapshots.push({
        path: adConfigPath,
        displayPath: displayPathForAd(adConfigPath, displayRoot),
        exists: true,
        ...parseAdOperationState(text, adConfigPath),
      });
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
      snapshots.push({
        path: adConfigPath,
        displayPath: path.basename(adConfigPath),
        exists: false,
        id: null,
        title: "",
        updatedOn: "",
        createdOn: "",
        contentHash: "",
        repostCount: null,
      });
    }
  }

  return snapshots;
}

function operationDonePatterns(operation) {
  if (operation === "publish") {
    return [
      {
        re: /DONE:\s+\(Re-\)published\s+(\d+)\s+ads?(?:\s+\((\d+)\s+failed after retries\))?/i,
        verb: "published",
      },
      { re: /DONE:\s+No new\/outdated ads found\./i, verb: "no_op" },
    ];
  }
  if (operation === "update") {
    return [
      {
        re: /DONE:\s+updated\s+(\d+)\s+ads?(?:\s+\((\d+)\s+failed after retries\))?/i,
        verb: "updated",
      },
      { re: /DONE:\s+No changed ads found\./i, verb: "no_op" },
    ];
  }
  if (operation === "delete") {
    return [
      {
        re: /DONE:\s+Deleted\s+(\d+)\s+of\s+(\d+)/i,
        verb: "deleted",
        totalGroup: true,
      },
      { re: /DONE:\s+No ads to delete found\./i, verb: "no_op" },
    ];
  }
  if (operation === "extend") {
    return [
      { re: /DONE:\s+Extended\s+(\d+)\s+ads?/i, verb: "extended" },
      { re: /DONE:\s+No ads (?:found to extend|extended)\./i, verb: "no_op" },
    ];
  }
  return [];
}

function parseOperationDone(operation, text) {
  for (const pattern of operationDonePatterns(operation)) {
    const match = pattern.re.exec(text);
    if (!match) {
      continue;
    }
    if (pattern.verb === "no_op") {
      return { verb: "no_op", count: 0, failed: 0, total: 0 };
    }
    if (pattern.totalGroup) {
      const count = Number(match[1] ?? 0);
      const total = Number(match[2] ?? count);
      return {
        verb: pattern.verb,
        count,
        failed: Math.max(total - count, 0),
        total,
      };
    }
    const count = Number(match[1] ?? 0);
    const failed = Number(match[2] ?? 0);
    return {
      verb: pattern.verb,
      count,
      failed,
      total: match[2] !== undefined ? count + failed : count,
    };
  }
  return null;
}

function summarizeAdSnapshotChanges(before = [], after = []) {
  const beforeByPath = new Map(before.map((entry) => [entry.path, entry]));
  const changes = [];
  for (const next of after) {
    const previous = beforeByPath.get(next.path);
    if (!previous || !next.exists) {
      continue;
    }
    const changedFields = [];
    if (next.id && next.id !== previous.id) {
      changedFields.push("id");
    }
    if (next.updatedOn && next.updatedOn !== previous.updatedOn) {
      changedFields.push("updated_on");
    }
    if (next.contentHash && next.contentHash !== previous.contentHash) {
      changedFields.push("content_hash");
    }
    if (next.repostCount !== null && next.repostCount !== previous.repostCount) {
      changedFields.push("repost_count");
    }
    if (changedFields.length) {
      changes.push({
        adPath: next.displayPath,
        title: next.title || previous.title,
        id: next.id,
        changedFields,
      });
    }
  }
  return changes;
}

function extractSuccessIds(text) {
  return [...String(text ?? "").matchAll(/SUCCESS:\s+ad (?:published|updated) with ID\s+(\d+)/gi)]
    .map((match) => match[1])
    .filter(Boolean);
}

function buildOperationOutcome({ operation, result, rawText, beforeSnapshots, afterSnapshots }) {
  if (operation === "verify") {
    return {
      success: Boolean(result.ok),
      status: result.ok ? "succeeded" : "failed",
      summary: result.ok ? "verify completed successfully" : "verify failed",
      evidence: result.ok ? ["process exited successfully"] : [],
    };
  }

  const done = parseOperationDone(operation, rawText);
  const successIds = extractSuccessIds(rawText);
  const changedAdConfigs = summarizeAdSnapshotChanges(beforeSnapshots, afterSnapshots);
  const failedCount = done?.failed ?? 0;
  const successEvidence = [];

  if (successIds.length) {
    successEvidence.push(`success ids: ${successIds.join(", ")}`);
  }
  if (done) {
    successEvidence.push(`done marker: ${done.verb}`);
  }
  if (changedAdConfigs.length) {
    successEvidence.push("selected ad config changed after operation");
  }
  if (result.ok) {
    successEvidence.push("process exited successfully");
  }

  if (done?.verb === "no_op") {
    return {
      success: true,
      status: "no_op",
      summary: "miniclaw completed successfully with no matching ads to change",
      evidence: successEvidence,
      counts: { changed: 0, failed: 0, total: 0 },
      adIds: successIds,
      changedAdConfigs,
    };
  }

  const hasSuccessEvidence =
    result.ok || successIds.length > 0 || changedAdConfigs.length > 0 || (done?.count ?? 0) > 0;
  if (hasSuccessEvidence && failedCount === 0) {
    return {
      success: true,
      status: result.timedOut ? "succeeded_with_process_timeout" : "succeeded",
      summary: done
        ? `miniclaw ${done.verb} ${done.count} ad${done.count === 1 ? "" : "s"}`
        : "miniclaw operation produced success evidence",
      evidence: successEvidence,
      counts: done ? { changed: done.count, failed: 0, total: done.total } : undefined,
      adIds: successIds,
      changedAdConfigs,
    };
  }

  if (hasSuccessEvidence && failedCount > 0) {
    return {
      success: false,
      status: "partial_failure",
      summary: `miniclaw changed ${done.count} ad${done.count === 1 ? "" : "s"} but ${failedCount} failed`,
      evidence: successEvidence,
      counts: { changed: done.count, failed: failedCount, total: done.total },
      adIds: successIds,
      changedAdConfigs,
    };
  }

  return {
    success: false,
    status: result.timedOut ? "timed_out" : "failed",
    summary: result.timedOut
      ? "miniclaw process timed out without success evidence"
      : "miniclaw process failed",
    evidence: successEvidence,
    adIds: successIds,
    changedAdConfigs,
  };
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
        adDirectory: displayPathForAd(directory, root),
        adPath: displayPathForAd(adConfigPath, root),
        relativeDirectory: relDir,
        ...summary,
      });
      if (ads.length >= maxResults) {
        return { ok: true, operation: "list_ads", count: ads.length, ads };
      }
    }
  }

  return { ok: true, operation: "list_ads", count: ads.length, ads };
}

export function getKleinanzeigenAdSchema() {
  return {
    ok: true,
    operation: "ad_schema",
    schema: {
      format: "yaml",
      fileNames: DRAFT_AD_FILE_NAMES,
      requiredForDraft: ["title", "description", "category"],
      requiredAfterDefaults: [
        "active",
        "type",
        "title",
        "description",
        "category",
        "price_type",
        "shipping_type",
        "sell_directly",
        "contact.name",
        "contact.zipcode",
        "republication_interval",
      ],
      limits: {
        title: { minLength: AD_TITLE_MIN_LENGTH, maxLength: AD_TITLE_MAX_LENGTH },
        description: { maxLength: AD_DESCRIPTION_MAX_LENGTH },
      },
      enums: {
        type: AD_TYPES,
        price_type: PRICE_TYPES,
        shipping_type: SHIPPING_TYPES,
        shipping_options: SHIPPING_OPTIONS,
        condition_values: CONDITION_VALUES,
      },
      fields: {
        active: "false is safest for drafts; true allows scoped publish/update",
        type: "OFFER or WANTED",
        title: "10 to 65 characters",
        description: "plain or multiline text, max 4000 characters",
        category: "built-in category name, custom config mapping name, or category ID",
        price: "whole euros preferred; required when price_type is FIXED",
        price_type: "FIXED, NEGOTIABLE, GIVE_AWAY, or NOT_APPLICABLE",
        images: "glob patterns relative to the ad config file",
        special_attributes: "category-specific string key/value pairs",
        shipping_type: "PICKUP, SHIPPING, or NOT_APPLICABLE",
        shipping_costs: "numeric custom shipping cost",
        shipping_options: "predefined package names from the enum list",
        sell_directly: "works only with SHIPPING plus shipping costs/options",
        contact: "usually inherited from config ad_defaults; avoid putting secrets in chat",
      },
      template: {
        active: false,
        type: "OFFER",
        title: "short descriptive item title",
        description: "condition, contents, pickup or shipping notes",
        category: "category name or id",
        price: 10,
        price_type: "NEGOTIABLE",
        shipping_type: "PICKUP",
        sell_directly: false,
        images: ["*.jpg"],
      },
      workflow: [
        "use kleinanzeigen_images_list for candidate image filenames",
        "use kleinanzeigen_draft_ad with active false to create a safe draft",
        "use scoped kleinanzeigen_verify on the draft directory",
        "use kleinanzeigen_set_ad_active with active true only when ready",
        "publish scoped to that directory only after a final scoped verify",
      ],
    },
    exitCode: 0,
    signal: null,
    timedOut: false,
    needsUserAction: false,
    stdout: "",
    stderr: "",
  };
}

async function resolveSingleAdConfig(params = {}, config = {}) {
  const adConfigPaths = normalizeStringArray(params.adConfigPaths, "adConfigPaths", {
    maxItems: 1,
  });
  const adDirectories = normalizeStringArray(params.adDirectories, "adDirectories", {
    maxItems: 1,
  });
  if (adConfigPaths.length + adDirectories.length !== 1) {
    throw new Error("provide exactly one adConfigPaths or adDirectories entry");
  }
  if (adConfigPaths.length) {
    return resolveAdConfigPathEntry(adConfigPaths[0], config, {
      kind: "file",
    });
  }
  return resolveAdConfigPathEntry(adDirectories[0], config, {
    kind: "directory",
  });
}

export async function readKleinanzeigenAd(params = {}, config = {}) {
  const adConfigPath = await resolveSingleAdConfig(params, config);
  const roots = await configuredAdRoots(config);
  const root = roots.find((entry) => pathIsInside(adConfigPath, entry)) ?? path.dirname(adConfigPath);
  const text = await fs.readFile(adConfigPath, "utf8");
  const includeContact = normalizeBoolean(params.includeContact, "includeContact") ?? false;

  return {
    ok: true,
    operation: "read_ad",
    adPath: displayPathForAd(adConfigPath, root),
    summary: parseAdSummary(text),
    yaml: sanitizeAdYaml(text, { includeContact }),
    contactRedacted: !includeContact,
    exitCode: 0,
    signal: null,
    timedOut: false,
    needsUserAction: false,
    stdout: "",
    stderr: "",
  };
}

export async function setKleinanzeigenAdActive(params = {}, config = {}) {
  if (params.confirm !== true) {
    throw new Error("confirm must be true before changing ad active state");
  }
  const active = normalizeBoolean(params.active, "active");
  if (active === undefined) {
    throw new Error("active is required");
  }

  const adConfigPath = await resolveSingleAdConfig(params, config);
  const extension = path.extname(adConfigPath).toLowerCase();
  if (![".yaml", ".yml"].includes(extension)) {
    throw new Error("set_ad_active currently supports only YAML ad configs");
  }

  const roots = await configuredAdRoots(config);
  const root = roots.find((entry) => pathIsInside(adConfigPath, entry)) ?? path.dirname(adConfigPath);
  const beforeText = await fs.readFile(adConfigPath, "utf8");
  const before = parseAdSummary(beforeText);
  const afterText = setYamlTopLevelActive(beforeText, active);
  const changed = afterText !== beforeText;
  if (changed) {
    await fs.writeFile(adConfigPath, afterText, "utf8");
  }

  return {
    ok: true,
    operation: "set_ad_active",
    changed,
    adPath: displayPathForAd(adConfigPath, root),
    previousActive: before.active,
    active,
    summary: parseAdSummary(afterText),
    nextActions: active
      ? [
          "run scoped kleinanzeigen_verify on this ad",
          "publish scoped to this ad only after verify succeeds",
        ]
      : ["the ad is no longer eligible for publish/update"],
    exitCode: 0,
    signal: null,
    timedOut: false,
    needsUserAction: false,
    stdout: "",
    stderr: "",
  };
}

function imageDimensionsFromBuffer(buffer, extension) {
  if (extension === ".png" && buffer.length >= 24) {
    const signature = buffer.subarray(0, 8).toString("hex");
    if (signature === "89504e470d0a1a0a") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
  }
  if (extension === ".gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if ([".jpg", ".jpeg"].includes(extension) && buffer.length >= 4) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) {
        break;
      }
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + length;
    }
  }
  return { width: null, height: null };
}

async function inspectImageFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(stat.size, 65536));
    await handle.read(buffer, 0, buffer.length, 0);
    return {
      extension,
      supportedByMiniclaw: SUPPORTED_IMAGE_EXTENSIONS.has(extension),
      bytes: stat.size,
      ...imageDimensionsFromBuffer(buffer, extension),
    };
  } finally {
    await handle.close();
  }
}

export async function listKleinanzeigenImages(params = {}, config = {}) {
  const maxResults = normalizePositiveInteger(params.maxResults, 100, 1, 500);
  const maxDepth = normalizePositiveInteger(params.maxDepth, 2, 0, 6);
  const { directory, root } = await resolveWritableAdDirectory(params.directory, config);
  const directoryStat = await fs.stat(directory);
  if (!directoryStat.isDirectory()) {
    throw new Error("directory is not a directory");
  }
  const resolvedDirectory = await realPath(directory);
  if (!pathIsInside(resolvedDirectory, root)) {
    throw new Error("directory is outside configured adRoots");
  }

  const images = [];
  async function visit(current, depth) {
    if (images.length >= maxResults || depth > maxDepth) {
      return;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (images.length >= maxResults) {
        return;
      }
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory() && depth < maxDepth) {
        await visit(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!IMAGE_FILE_EXTENSIONS.has(extension)) {
        continue;
      }
      const info = await inspectImageFile(fullPath);
      images.push({
        file: path.relative(resolvedDirectory, fullPath),
        adRootPath: displayPathForAd(fullPath, root),
        glob: path.relative(resolvedDirectory, fullPath),
        ...info,
      });
    }
  }

  await visit(resolvedDirectory, 0);
  return {
    ok: true,
    operation: "images_list",
    directory: displayPathForAd(resolvedDirectory, root),
    count: images.length,
    images,
    exitCode: 0,
    signal: null,
    timedOut: false,
    needsUserAction: false,
    stdout: "",
    stderr: "",
  };
}

function normalizeDraftAd(params = {}) {
  const title = normalizeAdDraftString(params.title, "title", {
    required: true,
    maxLength: AD_TITLE_MAX_LENGTH,
  });
  if (title.length < AD_TITLE_MIN_LENGTH) {
    throw new Error(`title length must be at least ${AD_TITLE_MIN_LENGTH} characters`);
  }
  const description = normalizeAdDraftString(params.description, "description", {
    required: true,
    maxLength: AD_DESCRIPTION_MAX_LENGTH,
  });
  const category = normalizeAdDraftString(params.category, "category", { required: true });
  const priceType = normalizeEnum(params.priceType, "priceType", PRICE_TYPES);
  const price = normalizeNumber(params.price, "price", { integer: true, min: 0 });
  if (priceType === "FIXED" && price === undefined) {
    throw new Error("price is required when priceType is FIXED");
  }
  if (priceType === "GIVE_AWAY" && price !== undefined) {
    throw new Error("price must not be specified when priceType is GIVE_AWAY");
  }

  const images = params.images === undefined
    ? undefined
    : normalizeStringArray(params.images, "images", { maxItems: 24 })
        .map((entry, index) => rejectUnsafeRelativePattern(entry, `images[${index}]`));
  const shippingOptions = params.shippingOptions === undefined
    ? undefined
    : normalizeStringArray(params.shippingOptions, "shippingOptions", { maxItems: 8 });
  if (shippingOptions?.some((entry) => !SHIPPING_OPTIONS.includes(entry))) {
    throw new Error(`shippingOptions must contain only: ${SHIPPING_OPTIONS.join(", ")}`);
  }

  const ad = {
    active: normalizeBoolean(params.active, "active") ?? false,
    type: normalizeEnum(params.type, "type", AD_TYPES) ?? "OFFER",
    title,
    description,
    descriptionPrefix: normalizeAdDraftString(params.descriptionPrefix, "descriptionPrefix"),
    descriptionSuffix: normalizeAdDraftString(params.descriptionSuffix, "descriptionSuffix"),
    category,
    specialAttributes: normalizeStringMap(params.specialAttributes, "specialAttributes"),
    price,
    priceType: priceType ?? "NEGOTIABLE",
    shippingType: normalizeEnum(params.shippingType, "shippingType", SHIPPING_TYPES) ?? "PICKUP",
    shippingCosts: normalizeNumber(params.shippingCosts, "shippingCosts", { min: 0 }),
    shippingOptions,
    sellDirectly: normalizeBoolean(params.sellDirectly, "sellDirectly") ?? false,
    images,
    contact: normalizeStringMap(params.contact, "contact"),
    republicationInterval: normalizeNumber(
      params.republicationInterval,
      "republicationInterval",
      { integer: true, min: 1 },
    ),
  };

  return Object.fromEntries(
    Object.entries(ad).filter(([, value]) => value !== undefined),
  );
}

export async function draftKleinanzeigenAd(params = {}, config = {}) {
  if (params.confirm !== true) {
    throw new Error("confirm must be true before writing an ad draft");
  }
  const fileName = normalizeOptionalString(params.fileName) ?? "ad.yaml";
  if (!DRAFT_AD_FILE_NAMES.includes(fileName)) {
    throw new Error(`fileName must be one of: ${DRAFT_AD_FILE_NAMES.join(", ")}`);
  }
  const overwrite = normalizeBoolean(params.overwrite, "overwrite") ?? false;
  const { directory, root } = await resolveWritableAdDirectory(params.directory, config);
  const ad = normalizeDraftAd(params);
  const yaml = renderAdYaml(ad);
  await fs.mkdir(directory, { recursive: true });
  const adConfigPath = path.join(directory, fileName);
  if (!overwrite) {
    try {
      await fs.stat(adConfigPath);
      throw new Error("ad draft already exists; set overwrite true to replace it");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  await fs.writeFile(adConfigPath, yaml, { encoding: "utf8", mode: 0o600 });

  return {
    ok: true,
    operation: "draft_ad",
    changed: true,
    adDirectory: displayPathForAd(directory, root),
    adPath: displayPathForAd(adConfigPath, root),
    active: ad.active,
    summary: parseAdSummary(yaml),
    nextActions: [
      "review the draft yaml",
      "run scoped kleinanzeigen_verify on this directory",
      "set active true only when ready to publish",
    ],
    exitCode: 0,
    signal: null,
    timedOut: false,
    needsUserAction: false,
    stdout: "",
    stderr: "",
  };
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
        : "fix the miniclaw config and rerun verify",
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
    return ["fix the miniclaw config and rerun kleinanzeigen_verify"];
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
    resolved.push(await resolveAdConfigPathEntry(adConfigPath, config, {
      kind: "file",
    }));
  }
  for (const directory of adDirectories) {
    resolved.push(await resolveAdConfigPathEntry(directory, config, {
      kind: "directory",
    }));
  }
  return [...new Set(resolved)];
}

async function resolveAdConfigPathEntry(entryPath, config, { kind }) {
  const raw = normalizeOptionalString(entryPath);
  if (!raw) {
    throw new Error(`${adPathScopeName(kind)} entry must not be empty`);
  }
  if (!path.isAbsolute(raw)) {
    return resolveRelativeAdConfigPathEntry(raw, config, { kind });
  }
  return resolveAbsoluteAdConfigPathEntry(raw, config, { kind });
}

function adPathScopeName(kind) {
  return kind === "file" ? "adConfigPaths" : "adDirectories";
}

function adPathNotFoundMessage(kind) {
  return `${adPathScopeName(kind)} entry was not found`;
}

function adPathUnreadableMessage(kind) {
  return `${adPathScopeName(kind)} entry cannot be read`;
}

function adPathWrongTypeMessage(kind) {
  if (kind === "file") {
    return "adConfigPaths entry is not a file";
  }
  return "adDirectories entry is not a directory";
}

function pathReadErrorMessage(error, kind) {
  if (["ENOENT", "ENOTDIR"].includes(error?.code)) {
    return adPathNotFoundMessage(kind);
  }
  return adPathUnreadableMessage(kind);
}

async function statAdPathEntry(candidate, kind) {
  try {
    return await fs.stat(candidate);
  } catch (error) {
    throw new Error(pathReadErrorMessage(error, kind));
  }
}

async function resolveAdConfigPathCandidate(candidate, config, { kind }) {
  const stat = await statAdPathEntry(candidate, kind);
  if (kind === "file") {
    if (!stat.isFile()) {
      throw new Error(adPathWrongTypeMessage(kind));
    }
    return assertInsideAdRoots(candidate, config);
  }

  if (!stat.isDirectory()) {
    throw new Error(adPathWrongTypeMessage(kind));
  }
  return assertInsideAdRoots(await resolveAdConfigInDirectory(candidate), config);
}

async function resolveAbsoluteAdConfigPathEntry(entryPath, config, { kind }) {
  return resolveAdConfigPathCandidate(path.resolve(entryPath), config, { kind });
}

async function resolveRelativeAdConfigPathEntry(entryPath, config, { kind }) {
  const roots = await configuredAdRoots(config);
  const matches = [];
  const softErrors = [];
  let escapedAllRoots = true;

  for (const root of roots) {
    const candidate = path.resolve(root, entryPath);
    if (!pathIsInside(candidate, root)) {
      continue;
    }
    escapedAllRoots = false;

    try {
      matches.push(await resolveAdConfigPathCandidate(candidate, config, { kind }));
    } catch (error) {
      if (error?.message === adPathNotFoundMessage(kind)) {
        continue;
      }
      softErrors.push(error);
    }
  }

  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length === 1) {
    return uniqueMatches[0];
  }
  if (uniqueMatches.length > 1) {
    throw new Error("relative ad handle matches multiple adRoots");
  }
  if (escapedAllRoots) {
    throw new Error("relative ad handle is outside configured adRoots");
  }
  if (softErrors.length) {
    throw softErrors[0];
  }
  throw new Error(adPathNotFoundMessage(kind));
}

function parseAdPreflightSummary(text, filePath) {
  if (path.extname(filePath).toLowerCase() === ".json") {
    try {
      const parsed = JSON.parse(text);
      return {
        active: typeof parsed.active === "boolean" ? parsed.active : null,
        title: typeof parsed.title === "string" ? parsed.title : "",
      };
    } catch {
      return { active: null, title: "" };
    }
  }
  return parseAdSummary(text);
}

async function inactiveScopedPublishAds(adConfigPaths, config = {}) {
  if (!adConfigPaths.length) {
    return [];
  }

  const roots = normalizeStringArray(config.adRoots, "adRoots", { maxItems: 50 });
  const resolvedRoots = await Promise.all(roots.map((root) => realPath(root)));
  const inactive = [];
  for (const adConfigPath of adConfigPaths) {
    const text = await fs.readFile(adConfigPath, "utf8");
    const summary = parseAdPreflightSummary(text, adConfigPath);
    if (summary.active === true) {
      continue;
    }
    const root =
      resolvedRoots.find((entry) => pathIsInside(adConfigPath, entry)) ?? path.dirname(adConfigPath);
    inactive.push({
      adPath: displayPathForAd(adConfigPath, root),
      title: summary.title,
      active: summary.active,
    });
  }
  return inactive;
}

function buildInactivePublishPreflightResult({ operation, inactiveAds, cliConfig, args }) {
  return {
    ok: false,
    operation,
    outcome: {
      success: false,
      status: "preflight_failed",
      summary: "selected ad is not active; activate it before publishing",
      evidence: ["publish preflight checked selected ad active state"],
      changedAdConfigs: [],
    },
    command: {
      executable: cliConfig.runtime.label,
      args: redactArgs(args),
    },
    processOk: false,
    exitCode: null,
    signal: null,
    timedOut: false,
    needsUserAction: false,
    diagnostics: inactiveAds.map((ad) => ({
      severity: "error",
      kind: "ad_preflight",
      field: "active",
      message: "selected ad is not active and would be skipped by publish",
      adPath: ad.adPath,
      title: ad.title,
      active: ad.active,
      suggestedAction:
        "use kleinanzeigen_set_ad_active with active true, then run scoped verify and publish",
    })),
    nextActions: [
      "re-read the selected ad with kleinanzeigen_read_ad",
      "use kleinanzeigen_set_ad_active with active true if the user wants to publish",
      "run scoped kleinanzeigen_verify",
      "retry kleinanzeigen_publish scoped to the same ad",
    ],
    stdout: "",
    stderr: "",
  };
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
  return createTemporaryConfig(cliConfig, scoped, ext);
}

async function createTemporaryConfig(cliConfig, content, ext = path.extname(cliConfig.configPath).toLowerCase()) {
  const configDir = path.dirname(cliConfig.configPath);
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const configPath = path.join(configDir, `.kleinclaw-${suffix}${ext === ".json" ? ".json" : ".yaml"}`);
  await fs.writeFile(configPath, content, { encoding: "utf8", mode: 0o600 });

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
  const commandRunner = options.commandRunner;
  const timeoutMs = options.timeoutMs ?? 120000;
  const maxBufferChars = Number.isInteger(options.maxBufferChars)
    ? Math.max(options.maxBufferChars, 0)
    : 20000;
  const captureLimit = maxBufferChars + 1;

  const capOutput = (value) => String(value ?? "").slice(0, captureLimit);
  if (typeof commandRunner !== "function") {
    return Promise.resolve({
      ok: false,
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: new Error("OpenClaw command runner is not available"),
      timedOut: false,
    });
  }

  return commandRunner([command, ...args], {
    cwd: options.cwd,
    env: options.env ?? buildChildEnv(),
    timeoutMs,
  }).then(
    (result) => {
      const timedOut =
        result?.termination === "timeout" || result?.termination === "no-output-timeout";
      const exitCode = Number.isInteger(result?.code) ? result.code : null;
      return {
        ok: exitCode === 0 && !timedOut,
        exitCode,
        signal: result?.signal ?? null,
        stdout: capOutput(result?.stdout),
        stderr: capOutput(result?.stderr),
        timedOut,
      };
    },
    (error) => ({
      ok: false,
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      error,
      timedOut: false,
    }),
  );
}

function runRuntimeProcess(runtime, args, options = {}) {
  return runProcess(runtime.command, [...runtime.argsPrefix, ...args], options);
}

export async function getKleinanzeigenBrowserStatus(config = {}) {
  const cliConfig = resolveCliConfig(config);
  await assertConfiguredFiles(cliConfig);
  const text = await fs.readFile(cliConfig.configPath, "utf8");
  const browserConfig = parseBrowserConfigText(text);
  const detectedBrowsers = await detectInstalledBrowsers({
    commandRunner: cliConfig.commandRunner,
  });

  return buildBrowserStatusPayload({ cliConfig, browserConfig, detectedBrowsers });
}

export async function configureKleinanzeigenBrowser(params = {}, config = {}) {
  const cliConfig = resolveCliConfig(config);
  await assertConfiguredFiles(cliConfig);
  const stat = await fs.stat(cliConfig.configPath);
  const text = await fs.readFile(cliConfig.configPath, "utf8");
  const currentBrowserConfig = parseBrowserConfigText(text);
  assertSafeBrowserConfigureParams(params);
  const detectedBrowsers = await detectInstalledBrowsers({
    commandRunner: cliConfig.commandRunner,
  });
  const previous = buildBrowserStatusPayload({
    cliConfig,
    browserConfig: currentBrowserConfig,
    detectedBrowsers,
  }).browser;
  const updates = await resolveBrowserUpdates(params, cliConfig, currentBrowserConfig);
  const nextText = replaceBrowserYaml(text, updates);
  const changed = nextText !== text;

  if (changed) {
    await writeFileAtomic(cliConfig.configPath, nextText, stat.mode & 0o777);
  }

  const nextBrowserConfig = parseBrowserConfigText(nextText);
  const status = buildBrowserStatusPayload({
    cliConfig,
    browserConfig: nextBrowserConfig,
    detectedBrowsers,
  });

  return {
    ...status,
    operation: "browser_configure",
    changed,
    changedKeys: Object.keys(updates),
    previous,
  };
}

function browserCheckOverridesRequested(params = {}) {
  return [
    "browser",
    "binaryLocation",
    "usePrivateWindow",
    "profileMode",
    "userDataDir",
    "profileName",
  ].some((key) => params[key] !== undefined);
}

function extractBrowserCheckDiagnostics(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const failures = [];
  const warnings = [];
  const successes = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/\(fail\)|failed|not found|not executable|permission/i.test(trimmed)) {
      failures.push(trimmed);
    } else if (/\(warn\)|warning/i.test(trimmed)) {
      warnings.push(trimmed);
    } else if (/\(ok\)|detected|executable/i.test(trimmed)) {
      successes.push(trimmed);
    }
  }

  return {
    failures,
    warnings,
    successes,
  };
}

export async function checkKleinanzeigenBrowser(params = {}, config = {}) {
  const cliConfig = resolveCliConfig(config);
  await assertConfiguredFiles(cliConfig);
  const original = await fs.readFile(cliConfig.configPath, "utf8");
  const currentBrowserConfig = parseBrowserConfigText(original);
  const requestedOverrides = browserCheckOverridesRequested(params);
  const updates = requestedOverrides
    ? await resolveBrowserUpdates(
        { ...params, confirm: true },
        cliConfig,
        currentBrowserConfig,
      )
    : {};
  const checkText = requestedOverrides ? replaceBrowserYaml(original, updates) : original;
  const tempConfig = requestedOverrides
    ? await createTemporaryConfig(cliConfig, checkText)
    : { config: cliConfig, cleanup: async () => {} };
  const checkConfig = tempConfig.config;
  const browserConfig = parseBrowserConfigText(checkText);
  const detectedBrowsers = await detectInstalledBrowsers({
    commandRunner: checkConfig.commandRunner,
  });
  const status = buildBrowserStatusPayload({
    cliConfig: checkConfig,
    browserConfig,
    detectedBrowsers,
  });

  let result;
  try {
    const args = buildKleinanzeigenArgs("diagnose", {}, checkConfig);
    result = await runRuntimeProcess(checkConfig.runtime, args, {
      cwd: checkConfig.cwd,
      timeoutMs: checkConfig.timeoutMs,
      maxBufferChars: checkConfig.maxOutputChars,
      env: buildChildEnv(),
      commandRunner: checkConfig.commandRunner,
    });
    const redactions = buildRedactions({ ...config, ...checkConfig });
    const rawText = [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join("\n");
    const diagnostics = extractBrowserCheckDiagnostics(rawText);
    const stdout = sanitizeText(result.stdout, redactions, checkConfig.maxOutputChars);
    const stderr = sanitizeText(
      result.error ? `${result.stderr}\n${result.error.message}` : result.stderr,
      redactions,
      checkConfig.maxOutputChars,
    );
    const failures = diagnostics.failures.map((line) => sanitizeText(line, redactions, 500));
    const warnings = diagnostics.warnings.map((line) => sanitizeText(line, redactions, 500));
    const canUse = Boolean(result.ok && failures.length === 0);

    return {
      ok: canUse,
      operation: "browser_check",
      canUse,
      check: {
        status: canUse ? "passed" : "failed",
        summary: canUse
          ? "browser config passed miniclaw diagnostics"
          : "browser config failed miniclaw diagnostics",
        failures,
        warnings,
      },
      browser: status.browser,
      detectedBrowsers: status.detectedBrowsers,
      command: {
        executable: checkConfig.runtime.label,
        args: redactArgs(args),
      },
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      needsUserAction: false,
      stdout,
      stderr,
    };
  } finally {
    await tempConfig.cleanup();
  }
}

export async function getKleinanzeigenStatus(config = {}) {
  const runtime = embeddedMiniclawRuntime();
  const configPath = resolveConfiguredConfigPath(config);
  const cwd =
    normalizeOptionalString(config.workingDirectory) ?? (configPath ? path.dirname(configPath) : undefined);
  const commandRunner = typeof config.commandRunner === "function" ? config.commandRunner : undefined;
  const redactions = buildRedactions({ ...config, runtime, workingDirectory: cwd, configPath });

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

  const versionResult = await runRuntimeProcess(runtime, ["version"], {
    cwd,
    timeoutMs: STATUS_TIMEOUT_MS,
    maxBufferChars: STATUS_OUTPUT_CHARS,
    env: buildChildEnv(),
    commandRunner,
  });
  const versionText = sanitizeText(
    [versionResult.stdout, versionResult.stderr, versionResult.error?.message].filter(Boolean).join("\n"),
    redactions,
    1000,
  );

  let helpResult = null;
  let helpText = "";
  if (!versionResult.error) {
    helpResult = await runRuntimeProcess(runtime, ["help"], {
      cwd,
      timeoutMs: STATUS_TIMEOUT_MS,
      maxBufferChars: STATUS_OUTPUT_CHARS,
      env: buildChildEnv(),
      commandRunner,
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
    executable: runtime.label,
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
  await assertConfiguredFiles(baseCliConfig);
  requireConfirmed(operation, params);
  const scopedAdConfigPaths = await resolveScopedAdConfigPaths(params, config);
  if (operation === "publish" && scopedAdConfigPaths.length > 0) {
    const inactiveAds = await inactiveScopedPublishAds(scopedAdConfigPaths, config);
    if (inactiveAds.length) {
      const args = buildKleinanzeigenArgs(operation, params, baseCliConfig);
      return buildInactivePublishPreflightResult({
        operation,
        inactiveAds,
        cliConfig: baseCliConfig,
        args,
      });
    }
  }
  const snapshotPaths =
    scopedAdConfigPaths.length > 0
      ? scopedAdConfigPaths
      : await readConfiguredAdFiles(baseCliConfig.configPath);
  const beforeSnapshots = await readAdOperationSnapshots(snapshotPaths, config);
  const scopedConfig = await createScopedConfig(baseCliConfig, scopedAdConfigPaths);
  const cliConfig = scopedConfig.config;
  await assertConfiguredFiles(cliConfig);
  let args;
  let result;
  try {
    args = buildKleinanzeigenArgs(operation, params, cliConfig);
    result = await runRuntimeProcess(cliConfig.runtime, args, {
      cwd: cliConfig.cwd,
      timeoutMs: cliConfig.timeoutMs,
      maxBufferChars: cliConfig.maxOutputChars,
      env: buildChildEnv(),
      commandRunner: cliConfig.commandRunner,
    });
  } finally {
    await scopedConfig.cleanup();
  }
  const afterSnapshots = await readAdOperationSnapshots(snapshotPaths, config);
  const redactions = buildRedactions({ ...config, ...cliConfig });
  const rawText = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
  const userAction = detectUserActionRequest(rawText);

  const stdout = sanitizeText(result.stdout, redactions, cliConfig.maxOutputChars);
  const stderr = sanitizeText(
    result.error ? `${result.stderr}\n${result.error.message}` : result.stderr,
    redactions,
    cliConfig.maxOutputChars,
  );
  const diagnostics = await extractKleinanzeigenDiagnostics(
    rawText,
    config,
  );
  const nextActions = buildNextActions(diagnostics, scopedAdConfigPaths.length > 0);
  const outcome = buildOperationOutcome({
    operation,
    result,
    rawText,
    beforeSnapshots,
    afterSnapshots,
  });

  return {
    ok: outcome.success,
    operation,
    outcome,
    command: {
      executable: cliConfig.runtime.label,
      args: redactArgs(args),
    },
    processOk: result.ok,
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
