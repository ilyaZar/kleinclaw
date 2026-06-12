/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { elementAttribute } from "./browser-elements.js";
import { dimensionsFromBelenConf, removeSuffix, textAttribute, visibleText, } from "./page-data.js";
import { By, TimeoutError, } from "../web-primitives.js";
const BREADCRUMB_MIN_DEPTH = 2;
const BREADCRUMB_RE = /\/c(\d+)/g;
const CONDITION_DISPLAY_TO_API = {
    defekt: "defect",
    "gut": "ok",
    "in ordnung": "alright",
    neu: "new",
    "sehr gut": "like_new",
};
const LABEL_TO_KEY = {
    zustand: "condition_s",
};
export async function extractCategoryFromAdPage(controller) {
    const categoryLine = await controller.webFind(By.ID, "vap-brdcrmb");
    let breadcrumbLinks = [];
    try {
        breadcrumbLinks = await controller.webFindAll(By.CSS_SELECTOR, "a", { parent: categoryLine });
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
    const categoryIds = [];
    for (const link of breadcrumbLinks) {
        const href = await elementAttribute(link, "href") ?? "";
        const ids = [...href.matchAll(BREADCRUMB_RE)].map((match) => match[1]);
        categoryIds.push(...ids);
    }
    if (categoryIds.length >= BREADCRUMB_MIN_DEPTH) {
        return `${categoryIds.at(-2)}/${categoryIds.at(-1)}`;
    }
    if (categoryIds.length === 1) {
        return `${categoryIds[0]}/${categoryIds[0]}`;
    }
    try {
        const categoryFirstPart = await controller.webFind(By.CSS_SELECTOR, "a:nth-of-type(2)", { parent: categoryLine });
        const categorySecondPart = await controller.webFind(By.CSS_SELECTOR, "a:nth-of-type(3)", { parent: categoryLine });
        const hrefFirst = await elementAttribute(categoryFirstPart, "href") ?? "";
        const hrefSecond = await elementAttribute(categorySecondPart, "href") ?? "";
        const firstRaw = hrefFirst.split("/").at(-1) ?? "";
        const secondRaw = hrefSecond.split("/").at(-1) ?? "";
        const first = firstRaw.startsWith("c") ? firstRaw.slice(1) : firstRaw;
        const second = secondRaw.startsWith("c") ? secondRaw.slice(1) : secondRaw;
        return `${first}/${second}`;
    }
    catch (error) {
        if (error instanceof TimeoutError) {
            throw new TimeoutError("Unable to locate breadcrumb fallback selectors within the " +
                "configured timeout.");
        }
        throw error;
    }
}
export async function extractSpecialAttributesFromAdPage(controller, belenConf) {
    const dimensions = dimensionsFromBelenConf(belenConf);
    const specialAttributesRaw = textAttribute(dimensions, "ad_attributes");
    if (!specialAttributesRaw) {
        return extractSpecialAttributesFromDom(controller);
    }
    const specialAttributes = {};
    for (const item of specialAttributesRaw.split("|")) {
        if (!item.includes(":")) {
            continue;
        }
        const [key, ...valueParts] = item.split(":");
        const value = valueParts.join(":");
        if (!key || key.endsWith(".versand_s") || key === "versand_s") {
            continue;
        }
        specialAttributes[key] = value;
    }
    return specialAttributes;
}
export async function extractSpecialAttributesFromDom(controller) {
    const attributes = {};
    let detailItems;
    try {
        detailItems = await controller.webFindAll(By.CSS_SELECTOR, "#viewad-details .addetailslist--detail");
    }
    catch (error) {
        if (error instanceof TimeoutError) {
            return attributes;
        }
        throw error;
    }
    for (const item of detailItems) {
        let valueText;
        let fullText;
        try {
            valueText = (await controller.webText(By.CSS_SELECTOR, ".addetailslist--detail--value", { parent: item })).trim().toLowerCase();
            fullText = (await visibleText(item)).trim().toLowerCase();
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                continue;
            }
            throw error;
        }
        const label = removeSuffix(fullText, valueText).trim();
        const attrKey = LABEL_TO_KEY[label];
        if (!attrKey) {
            continue;
        }
        if (attrKey === "condition_s") {
            const apiValue = CONDITION_DISPLAY_TO_API[valueText];
            if (apiValue) {
                attributes[attrKey] = apiValue;
            }
            continue;
        }
        attributes[attrKey] = valueText;
    }
    return attributes;
}
