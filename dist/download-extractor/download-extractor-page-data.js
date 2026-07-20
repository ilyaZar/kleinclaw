/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { isRecord } from "../value-guards.js";
export function dimensionsFromBelenConf(value) {
    if (!isRecord(value)) {
        return {};
    }
    const analytics = value.universalAnalyticsOpts;
    if (!isRecord(analytics)) {
        return {};
    }
    return isRecord(analytics.dimensions) ? analytics.dimensions : {};
}
export function textAttribute(value, name) {
    if (!isRecord(value)) {
        return null;
    }
    const raw = value[name];
    if (raw === null || raw === undefined) {
        return null;
    }
    return String(raw);
}
export async function visibleText(element) {
    if (element.evaluate) {
        return String(await element.evaluate(`
      function (elem) {
        let sel = window.getSelection();
        sel.removeAllRanges();
        let range = document.createRange();
        range.selectNode(elem);
        sel.addRange(range);
        let visibleText = sel.toString().trim();
        sel.removeAllRanges();
        return visibleText;
      }
    `) ?? "");
    }
    if (element.textContent) {
        return (await element.textContent()) ?? "";
    }
    const text = element.text;
    return text === null || text === undefined ? "" : String(text);
}
export function removeSuffix(value, suffix) {
    return suffix && value.endsWith(suffix)
        ? value.slice(0, -suffix.length)
        : value;
}
export function parseGermanDecimal(value) {
    return Number.parseFloat(value.replaceAll(".", "").replace(",", "."));
}
export function parseGermanCreationDate(value) {
    const parts = value.trim().split(".");
    if (parts.length !== 3) {
        throw new Error(`invalid creation date: ${value}`);
    }
    const [day, month, year] = parts;
    const date = new Date(`${year}-${month}-${day}T00:00:00`);
    if (Number.isNaN(date.valueOf())) {
        throw new Error(`invalid creation date: ${value}`);
    }
    return `${year}-${month}-${day}T00:00:00`;
}
export function parsePriceAmount(value) {
    const amount = value.replaceAll(".", "").split(/\s+/, 1)[0] ?? "";
    return Number.parseInt(amount, 10);
}
export function shippingOptionsFromResponse(response) {
    const decoded = JSON.parse(response.content);
    if (!isRecord(decoded)) {
        return [];
    }
    const data = decoded.data;
    if (!isRecord(data)) {
        return [];
    }
    const shippingOptionsResponse = data.shippingOptionsResponse;
    if (!isRecord(shippingOptionsResponse) ||
        !Array.isArray(shippingOptionsResponse.options)) {
        return [];
    }
    return shippingOptionsResponse.options.flatMap((option) => {
        if (!isRecord(option)) {
            return [];
        }
        const id = option.id;
        const packageSize = option.packageSize;
        const priceInEuroCent = option.priceInEuroCent;
        if (typeof id !== "string" ||
            typeof packageSize !== "string" ||
            typeof priceInEuroCent !== "number") {
            return [];
        }
        return [{ id, packageSize, priceInEuroCent }];
    });
}
export function translateDamageAttribute(value) {
    return [...value].map((char) => {
        if (char === "t") {
            return "ja";
        }
        if (char === "f") {
            return "nein";
        }
        return char;
    }).join("");
}
