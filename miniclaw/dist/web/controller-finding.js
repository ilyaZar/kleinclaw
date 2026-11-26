/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import assert from "node:assert";
import { allocateSelectorGroupBudgets } from "../browser/browser-selector-budget.js";
import { errorMessage } from "../value-guards.js";
import { requirePageMethod } from "./controller-support.js";
import { ControllerTiming } from "./controller-timing.js";
import { TimeoutError, isTimeoutLike } from "./errors.js";
import { By, selectorFor } from "./selector.js";
function firstAvailableDescription(selectors, description) {
    return description ?? `web_find_first_available(${selectors.length} selectors)`;
}
export class ControllerFinding extends ControllerTiming {
    locatorFor(type, value, parent) {
        if (parent && (type === By.TEXT || type === By.XPATH)) {
            throw new assert.AssertionError({
                message: `Specifying a parent element currently not supported with selector type: ${type}`,
            });
        }
        if (type === By.TEXT) {
            if (this.page.getByText) {
                return this.page.getByText(value, { exact: false });
            }
            return requirePageMethod(this.page.locator, "locator").call(this.page, selectorFor(type, value));
        }
        const selector = selectorFor(type, value);
        if (parent) {
            return requirePageMethod(parent.locator, "parent.locator").call(parent, selector);
        }
        return requirePageMethod(this.page.locator, "locator").call(this.page, selector);
    }
    async webFind(type, value, { parent = null, timeout } = {}) {
        return this.runWithTimeoutRetries((effectiveTimeout) => this.webFindOnce(type, value, effectiveTimeout, parent), { description: `web_find(${type}, ${value})`, key: "default", timeout });
    }
    async webFindFirstAvailable(selectors, { description, key = "default", parent = null, timeout, } = {}) {
        if (selectors.length === 0) {
            throw new Error("selectors must contain at least one selector");
        }
        return this.runWithTimeoutRetries((effectiveTimeout) => this.webFindFirstAvailableWithinBudget(selectors, effectiveTimeout, parent), {
            description: firstAvailableDescription(selectors, description),
            key,
            timeout,
        });
    }
    async webFindFirstAvailableOnce(selectors, { description, key = "default", parent = null, timeout, } = {}) {
        if (selectors.length === 0) {
            throw new Error("selectors must contain at least one selector");
        }
        const resolvedDescription = firstAvailableDescription(selectors, description);
        const configuredTimeout = this.baseTimeout(key, timeout);
        const effectiveTimeout = this.effectiveTimeout(key, timeout, 0);
        const startedAt = this.timeSource();
        try {
            const result = await this.webFindFirstAvailableWithinBudget(selectors, effectiveTimeout, parent);
            this.recordTiming(key, resolvedDescription, configuredTimeout, effectiveTimeout, this.timeSource() - startedAt, 0, true);
            return result;
        }
        catch (error) {
            if (!isTimeoutLike(error)) {
                throw error;
            }
            this.recordTiming(key, resolvedDescription, configuredTimeout, effectiveTimeout, this.timeSource() - startedAt, 0, false);
            throw error;
        }
    }
    async webFindFirstAvailableWithinBudget(selectors, effectiveTimeout, parent = null) {
        const budgets = allocateSelectorGroupBudgets(effectiveTimeout, selectors.length);
        const failures = [];
        for (const [index, selector] of selectors.entries()) {
            const [type, value] = selector;
            try {
                return [
                    await this.webFindOnce(type, value, budgets[index] ?? 0, parent),
                    index,
                ];
            }
            catch (error) {
                if (!isTimeoutLike(error)) {
                    throw error;
                }
                failures.push(errorMessage(error));
            }
        }
        const lastError = failures.at(-1) ?? "No selector candidates executed.";
        throw new TimeoutError("No HTML element found using selector group after trying " +
            `${selectors.length} alternatives within ${effectiveTimeout} ` +
            `seconds. Last error: ${lastError}`);
    }
    async webFindOnce(type, value, timeout, parent = null) {
        const locator = this.locatorFor(type, value, parent);
        const first = locator.first ? locator.first() : locator;
        if (first.waitFor) {
            try {
                await first.waitFor({ state: "attached", timeout: timeout * 1000 });
            }
            catch (error) {
                if (isTimeoutLike(error)) {
                    throw new TimeoutError(this.notFoundMessage(type, value, timeout, false));
                }
                throw error;
            }
            return first;
        }
        if (first.count) {
            const count = await first.count();
            if (count > 0) {
                return first;
            }
        }
        throw new TimeoutError(this.notFoundMessage(type, value, timeout, false));
    }
    async webProbe(type, value, { parent = null, timeout } = {}) {
        const probeTimeout = this.baseTimeout("quickDom", timeout);
        try {
            return await this.webFindOnce(type, value, probeTimeout, parent);
        }
        catch (error) {
            if (isTimeoutLike(error)) {
                return null;
            }
            throw error;
        }
    }
    async webFindAll(type, value, { parent = null, timeout } = {}) {
        return this.runWithTimeoutRetries((effectiveTimeout) => this.webFindAllOnce(type, value, effectiveTimeout, parent), { description: `web_find_all(${type}, ${value})`, key: "default", timeout });
    }
    async webFindAllOnce(type, value, timeout, parent = null) {
        if (type === By.ID) {
            throw new assert.AssertionError({
                message: `Unsupported selector type: ${type}`,
            });
        }
        const locator = this.locatorFor(type, value, parent);
        if (locator.waitFor) {
            try {
                await locator.waitFor({ state: "attached", timeout: timeout * 1000 });
            }
            catch (error) {
                if (isTimeoutLike(error)) {
                    throw new TimeoutError(this.notFoundMessage(type, value, timeout, true));
                }
                throw error;
            }
        }
        if (locator.all) {
            const all = await locator.all();
            if (all.length > 0) {
                return all;
            }
        }
        if (locator.count && locator.nth) {
            const count = await locator.count();
            if (count > 0) {
                return Array.from({ length: count }, (_, index) => locator.nth(index));
            }
        }
        throw new TimeoutError(this.notFoundMessage(type, value, timeout, true));
    }
    notFoundMessage(type, value, timeout, multiple) {
        const suffix = ` within ${timeout} seconds.`;
        switch (type) {
            case By.ID:
                return multiple
                    ? `No HTML elements found with ID '${value}'${suffix}`
                    : `No HTML element found with ID '${value}'${suffix}`;
            case By.CLASS_NAME:
                return multiple
                    ? `No HTML elements found with CSS class '${value}'${suffix}`
                    : `No HTML element found with CSS class '${value}'${suffix}`;
            case By.TAG_NAME:
                return multiple
                    ? `No HTML elements found of tag <${value}>${suffix}`
                    : `No HTML element found of tag <${value}>${suffix}`;
            case By.CSS_SELECTOR:
                return multiple
                    ? `No HTML elements found using CSS selector '${value}'${suffix}`
                    : `No HTML element found using CSS selector '${value}'${suffix}`;
            case By.TEXT:
                return multiple
                    ? `No HTML elements found containing text '${value}'${suffix}`
                    : `No HTML element found containing text '${value}'${suffix}`;
            case By.XPATH:
                return multiple
                    ? `No HTML elements found using XPath '${value}'${suffix}`
                    : `No HTML element found using XPath '${value}'${suffix}`;
        }
    }
}
