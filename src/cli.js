import fs from "node:fs/promises";
import path from "node:path";

import {
  assertSafeBrowserConfigureParams,
  buildBrowserStatusPayload,
  detectInstalledBrowsers,
  resolveBrowserUpdates,
} from "./browser-settings.js";
import {
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeWorkspaceMode,
} from "./input.js";
import {
  assertConfiguredFiles,
  invokeMiniclaw,
  OPERATIONS,
  resolveCliConfig,
} from "./miniclaw-runtime.js";
import { redactArgs } from "./process-boundary.js";

const LOCAL_AD_ID_SCOPE_OPERATIONS = new Set(["publish", "update", "delete", "extend"]);
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

function normalizeBoolean(value, name) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
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

  if (!configPath) {
    throw new Error("plugin config must set configPath or workingDirectory");
  }
  args.push(`--config=${configPath}`);
  args.push("--logfile=");
  args.push(`--workspace-mode=${workspaceMode}`);
  args.push("--output=json");
  for (const adFileOverride of normalizeStringArray(config.adFileOverrides, "adFileOverrides", {
    maxItems: 50,
  })) {
    args.push(`--ad-file=${adFileOverride}`);
  }
  if (spec.sideEffect) {
    args.push("--allow-live-browser");
  }

  args.push(operation);

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

function localSuccessProcessFields() {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    needsUserAction: false,
    stdout: "",
    stderr: "",
  };
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

function parseAdId(text, filePath = "") {
  if (path.extname(filePath).toLowerCase() === ".json") {
    try {
      const parsed = JSON.parse(text);
      return parsed.id ? String(parsed.id) : null;
    } catch {
      return null;
    }
  }

  for (const rawLine of String(text ?? "").split("\n")) {
    const match = /^id:\s*(.*)$/.exec(rawLine.trimEnd());
    if (match) {
      return stripYamlScalar(match[1]) || null;
    }
  }
  return null;
}

function buildOperationOutcome(operation, parsed) {
  if (!parsed.ok) {
    return {
      success: false,
      status: "protocol_error",
      summary: "miniclaw returned invalid structured output",
    };
  }
  const { counts, status } = parsed.result;
  const success = status === "succeeded" || status === "no_op";
  return {
    success,
    status,
    summary: status === "no_op"
      ? "miniclaw completed successfully with no matching ads to change"
      : status === "succeeded"
      ? `${operation} completed successfully`
      : status === "partial_failure"
      ? `${operation} completed with failed items`
      : `${operation} failed`,
    ...(counts ? { counts } : {}),
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

async function collectAdIdScopeCandidatePaths(config = {}) {
  const candidates = new Set();
  for (const adConfigPath of await readConfiguredAdFiles(config.configPath)) {
    try {
      const stat = await fs.stat(adConfigPath);
      if (stat.isFile()) {
        candidates.add(await realPath(adConfigPath));
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const roots = normalizeStringArray(config.adRoots, "adRoots", { maxItems: 50 });
  for (const root of roots) {
    const resolvedRoot = await realPath(root);
    const stat = await fs.stat(resolvedRoot);
    if (!stat.isDirectory()) {
      continue;
    }
    for (const adConfigPath of await findAdFiles(resolvedRoot, { maxFiles: 400 })) {
      candidates.add(await realPath(adConfigPath));
    }
  }

  return [...candidates].sort();
}

async function resolveAdIdScopedAdConfigPaths(operation, params = {}, config = {}) {
  if (!LOCAL_AD_ID_SCOPE_OPERATIONS.has(operation)) {
    return [];
  }

  const adIds = normalizeAdIds(params.adIds);
  if (!adIds) {
    return [];
  }

  const requestedIds = [...new Set(adIds)];
  const matchesById = new Map(requestedIds.map((id) => [id, []]));
  for (const adConfigPath of await collectAdIdScopeCandidatePaths(config)) {
    let text;
    try {
      text = await fs.readFile(adConfigPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const id = parseAdId(text, adConfigPath);
    if (matchesById.has(id)) {
      matchesById.get(id).push(adConfigPath);
    }
  }

  if (requestedIds.some((id) => matchesById.get(id).length === 0)) {
    return [];
  }
  return [...new Set(requestedIds.flatMap((id) => matchesById.get(id)))];
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
    ...localSuccessProcessFields(),
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
    ...localSuccessProcessFields(),
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
    ...localSuccessProcessFields(),
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
    ...localSuccessProcessFields(),
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
    ...localSuccessProcessFields(),
  };
}

function buildNextActions(diagnostics = [], scoped) {
  if (!diagnostics.length) {
    return [];
  }
  if (diagnostics.some((entry) => entry.kind === "ip_range_blocked")) {
    return ["stop automatic retries and inform the user to try again later"];
  }
  if (diagnostics.some((entry) => entry.kind === "captcha")) {
    return ["solve the account check in the browser before retrying"];
  }
  if (diagnostics.some((entry) => entry.kind === "manual_action_required")) {
    return ["complete the account check in an interactive browser run"];
  }
  if (scoped && diagnostics.some((entry) => entry.kind === "validation_error")) {
    return ["fix the selected ad config and rerun scoped kleinanzeigen_verify"];
  }
  return diagnostics.some((entry) => entry.kind === "validation_error")
    ? ["fix invalid config or ads and rerun kleinanzeigen_verify"]
    : [];
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
      executable: "miniclaw",
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

  try {
    const args = buildKleinanzeigenArgs("diagnose", {}, checkConfig);
    const { diagnostics, parsed, result, stderr } = await invokeMiniclaw(
      "diagnose",
      args,
      checkConfig,
      config,
    );
    const failures = diagnostics
      .filter((entry) => entry.severity === "error")
      .map((entry) => entry.message);
    const warnings = diagnostics
      .filter((entry) => entry.severity === "warning")
      .map((entry) => entry.message);
    if (!parsed.ok) {
      failures.push("miniclaw returned invalid structured output");
    }
    const canUse = Boolean(
      parsed.ok &&
      parsed.result.status === "succeeded" &&
      result.ok,
    );

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
        executable: "miniclaw",
        args: redactArgs(args),
      },
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      needsUserAction: false,
      stdout: "",
      stderr,
    };
  } finally {
    await tempConfig.cleanup();
  }
}

export async function runKleinanzeigenOperation(operation, params = {}, config = {}) {
  const baseCliConfig = resolveCliConfig(config);
  await assertConfiguredFiles(baseCliConfig);
  requireConfirmed(operation, params);
  const requestedScopedAdConfigPaths = await resolveScopedAdConfigPaths(params, config);
  const adIdScopedAdConfigPaths = requestedScopedAdConfigPaths.length
    ? []
    : await resolveAdIdScopedAdConfigPaths(
        operation,
        params,
        { ...config, configPath: baseCliConfig.configPath },
      );
  const scopedAdConfigPaths = requestedScopedAdConfigPaths.length
    ? requestedScopedAdConfigPaths
    : adIdScopedAdConfigPaths;
  if (operation === "publish" && scopedAdConfigPaths.length > 0) {
    const inactiveAds = await inactiveScopedPublishAds(scopedAdConfigPaths, config);
    if (inactiveAds.length) {
      const preflightCliConfig = { ...baseCliConfig, adFileOverrides: scopedAdConfigPaths };
      const args = buildKleinanzeigenArgs(operation, params, preflightCliConfig);
      return buildInactivePublishPreflightResult({
        operation,
        inactiveAds,
        cliConfig: preflightCliConfig,
        args,
      });
    }
  }
  const cliConfig = scopedAdConfigPaths.length > 0
    ? { ...baseCliConfig, adFileOverrides: scopedAdConfigPaths }
    : baseCliConfig;
  await assertConfiguredFiles(cliConfig);
  const args = buildKleinanzeigenArgs(operation, params, cliConfig);
  const { diagnostics, parsed, result, stderr } = await invokeMiniclaw(
    operation,
    args,
    cliConfig,
    config,
  );
  const nextActions = buildNextActions(diagnostics, scopedAdConfigPaths.length > 0);
  const outcome = buildOperationOutcome(operation, parsed);
  const userAction = diagnostics.find((entry) =>
    entry.kind === "captcha" ||
    entry.kind === "ip_range_blocked" ||
    entry.kind === "manual_action_required"
  );

  return {
    ok: outcome.success,
    operation,
    outcome,
    command: {
      executable: "miniclaw",
      args: redactArgs(args),
    },
    processOk: result.ok,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    needsUserAction: Boolean(userAction),
    ...(userAction ? { userActionHint: nextActions[0] } : {}),
    ...(diagnostics.length ? { diagnostics, nextActions } : {}),
    stdout: "",
    stderr,
  };
}
