import fs from "node:fs/promises";
import path from "node:path";
import { AD_FILE_NAMES, realPath } from "./cli-ad-paths.js";
import { stripYamlScalar } from "./cli-yaml-text.js";
import { normalizeAdIds, normalizeStringArray } from "./cli-operation-arguments.js";
import { normalizeOptionalString, normalizePositiveInteger } from "./input.js";
const LOCAL_AD_ID_SCOPE_OPERATIONS = new Set(["publish", "update", "delete", "extend"]);
export function localSuccessProcessFields() {
    return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        needsUserAction: false,
        stdout: "",
        stderr: "",
    };
}
export function parseAdSummary(text) {
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
            }
            else if (topLevel[1] === "id") {
                summary.id = value || null;
            }
            else if (topLevel[1] === "title") {
                summary.title = value;
            }
            else if (topLevel[1] === "price") {
                summary.price = value || null;
            }
            else if (topLevel[1] === "category") {
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
        }
        catch {
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
export function displayPathForAd(filePath, root) {
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
        }
        catch (error) {
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
export async function resolveAdIdScopedAdConfigPaths(operation, params = {}, config = {}) {
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
        }
        catch (error) {
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
