import fs from "node:fs/promises";
import path from "node:path";
import { normalizeOptionalString } from "./input.js";
import { normalizeStringArray } from "./cli-operation-arguments.js";
export const AD_FILE_NAMES = ["ad.yaml", "ad.yml", "ad.json"];
export async function realPath(value) {
    return fs.realpath(path.resolve(value));
}
export function pathIsInside(candidate, root) {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
export async function assertInsideAdRoots(filePath, config = {}) {
    const configuredRoots = normalizeStringArray(config.adRoots, "adRoots", {
        maxItems: 50,
    });
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
export async function configuredAdRoots(config = {}) {
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
        }
        catch (error) {
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
export async function resolveWritableAdDirectory(directory, config = {}) {
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
export async function resolveAdConfigInDirectory(directory) {
    for (const filename of AD_FILE_NAMES) {
        const candidate = path.join(directory, filename);
        try {
            const stat = await fs.stat(candidate);
            if (stat.isFile()) {
                return candidate;
            }
        }
        catch (error) {
            if (error?.code !== "ENOENT") {
                throw error;
            }
        }
    }
    throw new Error("ad directory has no ad.yaml, ad.yml, or ad.json");
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
    return kind === "file"
        ? "adConfigPaths entry is not a file"
        : "adDirectories entry is not a directory";
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
    }
    catch (error) {
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
        }
        catch (error) {
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
export async function resolveAdConfigPathEntry(entryPath, config, { kind }) {
    const raw = normalizeOptionalString(entryPath);
    if (!raw) {
        throw new Error(`${adPathScopeName(kind)} entry must not be empty`);
    }
    if (!path.isAbsolute(raw)) {
        return resolveRelativeAdConfigPathEntry(raw, config, { kind });
    }
    return resolveAdConfigPathCandidate(path.resolve(raw), config, { kind });
}
