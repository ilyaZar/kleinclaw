import fs from "node:fs/promises";
import path from "node:path";
import { displayPathForAd, localSuccessProcessFields, parseAdSummary } from "./cli-ad-catalog.js";
import { configuredAdRoots, pathIsInside, resolveAdConfigPathEntry, resolveWritableAdDirectory, } from "./cli-ad-paths.js";
import { renderAdYaml, sanitizeAdYaml, setYamlTopLevelActive } from "./cli-ad-yaml.js";
import { normalizeBoolean, normalizeStringArray } from "./cli-operation-arguments.js";
import { normalizeOptionalString } from "./input.js";
const DRAFT_AD_FILE_NAMES = ["ad.yaml", "ad.yml"];
const AD_TITLE_MIN_LENGTH = 10;
const AD_TITLE_MAX_LENGTH = 65;
const AD_DESCRIPTION_MAX_LENGTH = 4000;
const PRICE_TYPES = ["FIXED", "NEGOTIABLE", "GIVE_AWAY", "NOT_APPLICABLE"];
const AD_TYPES = ["OFFER", "WANTED"];
const SHIPPING_TYPES = ["PICKUP", "SHIPPING", "NOT_APPLICABLE"];
const SHIPPING_OPTIONS = [
    "DHL_2", "Hermes_Päckchen", "Hermes_S", "DHL_5", "Hermes_M",
    "DHL_10", "DHL_20", "DHL_31,5", "Hermes_L",
];
const CONDITION_VALUES = ["new", "like_new", "ok", "alright", "defect"];
function normalizeObject(value, name) {
    if (value === undefined)
        return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${name} must be an object`);
    }
    return value;
}
function normalizeAdDraftString(value, name, { required = false, maxLength } = {}) {
    if (value === undefined) {
        if (required)
            throw new Error(`${name} is required`);
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
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || !allowed.includes(value)) {
        throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
    }
    return value;
}
function normalizeNumber(value, name, { integer = false, min } = {}) {
    if (value === undefined)
        return undefined;
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
    if (object === undefined)
        return undefined;
    return Object.fromEntries(Object.entries(object)
        .filter(([key, entry]) => String(key).trim() && entry !== undefined && entry !== null)
        .map(([key, entry]) => [String(key).trim(), String(entry).trim()]));
}
function rejectUnsafeRelativePattern(value, name) {
    const pattern = normalizeAdDraftString(value, name, { required: true });
    if (path.isAbsolute(pattern) || pattern.split(/[\\/]/).includes("..")) {
        throw new Error(`${name} must be relative to the ad directory`);
    }
    return pattern;
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
                "active", "type", "title", "description", "category", "price_type",
                "shipping_type", "sell_directly", "contact.name", "contact.zipcode",
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
                shipping_costs: "obsolete custom cost; Kleinanzeigen dropped individual shipping, use shipping_options",
                shipping_options: "predefined package names from the enum list",
                sell_directly: "works only with SHIPPING plus shipping_options",
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
    const adConfigPaths = normalizeStringArray(params.adConfigPaths, "adConfigPaths", { maxItems: 1 });
    const adDirectories = normalizeStringArray(params.adDirectories, "adDirectories", { maxItems: 1 });
    if (adConfigPaths.length + adDirectories.length !== 1) {
        throw new Error("provide exactly one adConfigPaths or adDirectories entry");
    }
    if (adConfigPaths.length) {
        return resolveAdConfigPathEntry(adConfigPaths[0], config, { kind: "file" });
    }
    return resolveAdConfigPathEntry(adDirectories[0], config, { kind: "directory" });
}
export async function readKleinanzeigenAd(params = {}, config = {}) {
    const adConfigPath = await resolveSingleAdConfig(params, config);
    const roots = await configuredAdRoots(config);
    const root = roots.find((entry) => pathIsInside(adConfigPath, entry)) ??
        path.dirname(adConfigPath);
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
    const root = roots.find((entry) => pathIsInside(adConfigPath, entry)) ??
        path.dirname(adConfigPath);
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
        shippingType: normalizeEnum(params.shippingType, "shippingType", SHIPPING_TYPES) ??
            "PICKUP",
        shippingCosts: normalizeNumber(params.shippingCosts, "shippingCosts", { min: 0 }),
        shippingOptions,
        sellDirectly: normalizeBoolean(params.sellDirectly, "sellDirectly") ?? false,
        images,
        contact: normalizeStringMap(params.contact, "contact"),
        republicationInterval: normalizeNumber(params.republicationInterval, "republicationInterval", { integer: true, min: 1 }),
    };
    return Object.fromEntries(Object.entries(ad).filter(([, value]) => value !== undefined));
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
        }
        catch (error) {
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
