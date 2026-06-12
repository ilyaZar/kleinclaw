/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import path from "node:path";
import { glob } from "glob";
import { contentHashForAd, toAd, } from "./model/ad-model.js";
import { ValidationError } from "./model/validation-error.js";
import { loadDataFile } from "./io.js";
const NUMERIC_IDS_RE = /^\d+(,\d+)*$/;
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".gif", ".jpg", ".jpeg", ".png"]);
export async function findAdFiles(configPath, config) {
    const root = path.dirname(configPath);
    const files = new Set();
    for (const pattern of config.adFiles) {
        const matches = await glob(pattern, {
            cwd: root,
            absolute: true,
            nodir: true,
        });
        for (const match of matches) {
            files.add(path.resolve(match));
        }
    }
    return [...files].sort();
}
function asAdInput(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("ad must be a mapping/object");
    }
    return value;
}
function wholeDaysSince(reference, now) {
    const millisPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((now.valueOf() - reference.valueOf()) / millisPerDay);
}
export function isDueForRepublication(ad, now = new Date()) {
    const lastUpdated = ad.updatedOn ?? ad.createdOn;
    if (!lastUpdated) {
        return true;
    }
    return wholeDaysSince(lastUpdated, now) > ad.republicationInterval;
}
export function isChangedAd(raw, ad) {
    if (!ad.id) {
        return false;
    }
    const storedHash = raw.content_hash;
    if (typeof storedHash !== "string" || !storedHash) {
        return false;
    }
    const currentHash = contentHashForAd(raw);
    if (currentHash === storedHash) {
        return false;
    }
    raw.content_hash = currentHash;
    return true;
}
async function expandImagePatterns(ad, adFilePath) {
    if (ad.images.length === 0) {
        return ad;
    }
    const adDir = path.dirname(adFilePath);
    const images = [];
    for (const imagePattern of ad.images) {
        const patternImages = new Set();
        const matches = await glob(imagePattern, {
            cwd: adDir,
            nodir: true,
        });
        for (const imageFile of matches) {
            const extension = path.extname(imageFile).toLowerCase();
            if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
                throw new ValidationError(`Unsupported image file type [${imageFile}]`);
            }
            patternImages.add(path.isAbsolute(imageFile) ? imageFile : path.resolve(adDir, imageFile));
        }
        images.push(...[...patternImages].sort());
    }
    if (images.length === 0) {
        throw new ValidationError(`No images found for given file patterns ${JSON.stringify(ad.images)} at ${adDir}`);
    }
    return { ...ad, images: [...new Set(images)] };
}
function resolveCategoryAlias(ad, categories) {
    let resolvedCategory = categories[ad.category];
    if (!resolvedCategory && ad.category.includes(">")) {
        const parentCategory = ad.category
            .slice(0, ad.category.lastIndexOf(">"))
            .trim();
        resolvedCategory = categories[parentCategory];
    }
    return resolvedCategory ? { ...ad, category: resolvedCategory } : ad;
}
export async function loadSelectedAds({ configPath, config, selector, ignoreInactive = true, excludeAdsWithId = true, now = new Date(), }) {
    const adFiles = await findAdFiles(configPath, config);
    const root = path.dirname(configPath);
    const selectors = selector.split(",").map((entry) => entry.trim());
    const useSpecificIds = NUMERIC_IDS_RE.test(selector);
    const ids = new Set(useSpecificIds ? selectors.map((entry) => Number(entry)) : []);
    const ads = [];
    for (const filePath of adFiles) {
        const raw = asAdInput(await loadDataFile(filePath));
        const ad = toAd(raw, config.adDefaults);
        const relativePath = path.relative(root, filePath);
        if (ignoreInactive && !ad.active) {
            continue;
        }
        if (useSpecificIds) {
            if (!ad.id || !ids.has(ad.id)) {
                continue;
            }
        }
        else {
            let shouldInclude = false;
            if (selectors.includes("changed") && isChangedAd(raw, ad)) {
                shouldInclude = true;
            }
            if (selectors.includes("new") && (!ad.id || !excludeAdsWithId)) {
                shouldInclude = true;
            }
            if (selectors.includes("due") && isDueForRepublication(ad, now)) {
                shouldInclude = true;
            }
            if (selectors.includes("all")) {
                shouldInclude = true;
            }
            if (!shouldInclude) {
                continue;
            }
        }
        const resolvedAd = resolveCategoryAlias(ad, config.categories);
        ads.push({
            filePath,
            relativePath,
            ad: await expandImagePatterns(resolvedAd, filePath),
            raw,
        });
    }
    return ads;
}
