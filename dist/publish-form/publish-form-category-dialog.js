/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { isRecord } from "../value-guards.js";
import { TimeoutError } from "../web-primitives.js";
import { callPageScript, CATEGORY_DIALOG_SCRIPT, CATEGORY_TREE_ACTION_SCRIPT, } from "../web/page-scripts.js";
import { CategoryResolutionError } from "./publish-form-errors.js";
const EXACT_MATCH = 3;
// category, subcategory; deeper path segments are attribute values
const ATTRIBUTE_DEPTH = 2;
const TREE_ACTION_TIMEOUT_MS = 15_000;
const OTHER_LABELS = ["Sonstiges", "Sonstige", "Andere", "Weiteres", "Weitere"];
export function categoryLabelTokens(label) {
    const normalized = label.toLowerCase()
        .replaceAll("ä", "ae")
        .replaceAll("ö", "oe")
        .replaceAll("ü", "ue")
        .replaceAll("ß", "ss");
    return (normalized.match(/[a-z0-9]+/g) ?? []).filter((word) => word !== "und");
}
// 3 = same tokens, 2 = every candidate token offered, 0 = no match
export function categoryLabelMatchScore(label, candidate) {
    const labelTokens = categoryLabelTokens(label);
    const candidateTokens = categoryLabelTokens(candidate);
    if (labelTokens.length === 0 || candidateTokens.length === 0) {
        return 0;
    }
    if (labelTokens.join(" ") === candidateTokens.join(" ")) {
        return EXACT_MATCH;
    }
    return candidateTokens.every((token) => labelTokens.includes(token)) ? 2 : 0;
}
function pathSegments(category) {
    return category.split("/").map((segment) => segment.trim()).filter(Boolean);
}
// Visible-label candidates per path segment from the bundled category names.
export function categoryDialogLabelOptions(category, categories, productTitle = null) {
    const path = pathSegments(category);
    const options = path.map(() => new Set());
    for (const [displayPath, categoryPath] of Object.entries(categories)) {
        const displaySegments = displayPath.split(">").map((segment) => segment.trim());
        const categorySegments = pathSegments(categoryPath);
        const depthLimit = Math.min(path.length, displaySegments.length, categorySegments.length);
        for (let depth = 0; depth < depthLimit; depth += 1) {
            if (categorySegments.slice(0, depth + 1).join("/") === path.slice(0, depth + 1).join("/")) {
                options[depth].add(displaySegments[depth]);
            }
        }
    }
    // Aliases may point at a generic "other" leaf without naming it.
    const last = path.length - 1;
    if (last >= 0 && options[last].size === 0) {
        const finalSegment = path[last].toLowerCase();
        if (/^\d+$/.test(finalSegment) || OTHER_LABELS.some((label) => label.toLowerCase() === finalSegment)) {
            OTHER_LABELS.forEach((label) => options[last].add(label));
            for (const parent of last > 0 ? options[last - 1] : []) {
                for (const prefix of ["Andere", "Sonstige", "Weitere"]) {
                    options[last].add(`${prefix} ${parent}`);
                }
            }
        }
        else {
            options[last].add(finalSegment.replaceAll("_", " "));
        }
    }
    // The picker splits the combined category; the title tells which one.
    if (path[last] === "pullover_strickjacken" && productTitle) {
        const title = productTitle.toLowerCase();
        if (/\b(?:strickjacke|cardigan)\w*\b/.test(title)) {
            options[last].add("Strickjacken");
        }
        else if (/\b(?:pullover|pulli|hoodie|sweatshirt|sweater)\w*\b/.test(title)) {
            options[last].add("Pullover");
        }
    }
    return options.map((labels) => [...labels].sort());
}
async function categoryTreeAction(controller, action, body) {
    try {
        const response = await controller.webExecute(callPageScript(CATEGORY_TREE_ACTION_SCRIPT, action, body, TREE_ACTION_TIMEOUT_MS));
        return isRecord(response) && response.statusCode === 200 ? response.data : null;
    }
    catch {
        return null;
    }
}
function records(value) {
    return Array.isArray(value) ? value.filter(isRecord) : [];
}
function attributeOptionLabel(attribute, value) {
    for (const option of records(attribute.localizedOptions)) {
        if (String(option.value ?? "").toLowerCase() === value.toLowerCase()) {
            return typeof option.localizedValue === "string" && option.localizedValue
                ? option.localizedValue
                : null;
        }
    }
    return null;
}
// The site's current labels per depth: categories from the category tree,
// attribute values (depth 2-3) from the picker data. Missing data -> {}.
export async function siteCategoryLabels(controller, category) {
    const path = pathSegments(category);
    const labels = new Map();
    let nodes = records(await categoryTreeAction(controller, "getTree", {}));
    for (let depth = 0; depth < Math.min(path.length, ATTRIBUTE_DEPTH); depth += 1) {
        const node = nodes.find((item) => String(item.id) === path[depth] && item.name);
        if (!node) {
            break;
        }
        labels.set(depth, String(node.name));
        nodes = records(node.children);
    }
    if (path.length <= ATTRIBUTE_DEPTH || !/^\d+$/.test(path[1]) || /^\d+$/.test(path[2])) {
        return labels;
    }
    const attributes = records(await categoryTreeAction(controller, "getPickerAttributes", { categoryId: Number(path[1]) }));
    const attribute = attributes.find((item) => attributeOptionLabel(item, path[2]) !== null);
    if (!attribute) {
        return labels;
    }
    labels.set(ATTRIBUTE_DEPTH, attributeOptionLabel(attribute, path[2]) ?? path[2]);
    if (path.length > ATTRIBUTE_DEPTH + 1) {
        const dependents = records(await categoryTreeAction(controller, "getDependentPickerAttributes", { attributeId: String(attribute.attributeId), categoryId: path[1], optionValue: path[2] }));
        for (const dependent of dependents) {
            const label = attributeOptionLabel(dependent, path[3]);
            if (label !== null) {
                labels.set(ATTRIBUTE_DEPTH + 1, label);
                break;
            }
        }
    }
    return labels;
}
async function dialogAction(controller, action, label = null) {
    return controller.webExecute(callPageScript(CATEGORY_DIALOG_SCRIPT, action, label));
}
export async function categoryDialogOpen(controller) {
    return await dialogAction(controller, "probe") === true;
}
async function offeredLabels(controller) {
    const offered = await dialogAction(controller, "offered");
    return Array.isArray(offered) ? offered.map(String) : [];
}
async function clickDialogLevel(controller, category, depth, candidates) {
    const scored = (labels) => labels.map((label) => ({
        label,
        score: Math.max(0, ...candidates.map((candidate) => categoryLabelMatchScore(label, candidate))),
    }));
    let offered = scored(await offeredLabels(controller));
    // Some sessions first show only a generic entry point.
    if (depth === 0 &&
        offered.length === 1 &&
        offered[0].score === 0 &&
        ["alle kategorien", "all categories"].includes(categoryLabelTokens(offered[0].label).join(" "))) {
        await dialogAction(controller, "click", offered[0].label);
        await controller.webSleep();
        offered = scored(await offeredLabels(controller));
    }
    const best = Math.max(0, ...offered.map((choice) => choice.score));
    const matches = offered.filter((choice) => best > 0 && choice.score === best);
    if (matches.length !== 1) {
        const visible = offered.map((choice) => choice.label).sort().join(", ") || "<none>";
        throw new CategoryResolutionError(`Category dialog has no unique match for '${category}' at path segment ` +
            `'${pathSegments(category)[depth]}'. Offered choices: ${visible}`);
    }
    if (await dialogAction(controller, "click", matches[0].label) !== "clicked") {
        throw new CategoryResolutionError(`Category dialog choice '${matches[0].label}' cannot be clicked.`);
    }
    await controller.webSleep();
    return matches[0].label;
}
export async function setCategoryInDialog(controller, category, categories, productTitle = null) {
    const labelOptions = categoryDialogLabelOptions(category, categories, productTitle);
    // The site's labels win; bundled names go stale when categories are renamed.
    for (const [depth, label] of await siteCategoryLabels(controller, category)) {
        if (depth < labelOptions.length) {
            labelOptions[depth] = [label];
        }
    }
    if (labelOptions.length === 0 || labelOptions.some((candidates) => candidates.length === 0)) {
        throw new CategoryResolutionError(`Category dialog cannot resolve the configured category path '${category}' to visible labels.`);
    }
    let leaf = "";
    for (const [depth, candidates] of labelOptions.entries()) {
        leaf = await clickDialogLevel(controller, category, depth, candidates);
    }
    // Fail closed unless the requested leaf is the selected one.
    const pressed = await dialogAction(controller, "pressed");
    if (!Array.isArray(pressed) || !pressed.includes(leaf)) {
        throw new CategoryResolutionError(`Category dialog did not select the requested leaf '${leaf}'. Kleinanzeigen ` +
            `may ask for one more level; offered now: ${(await offeredLabels(controller)).join(", ") || "<none>"}`);
    }
    const applied = await dialogAction(controller, "apply");
    if (applied !== "clicked") {
        throw new CategoryResolutionError(`Category dialog cannot apply '${category}' (${String(applied)}).`);
    }
    await controller.webSleep();
    if (await categoryDialogOpen(controller)) {
        throw new TimeoutError(`Category dialog remained open after applying '${category}'.`);
    }
}
