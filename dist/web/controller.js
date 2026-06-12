/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import assert from "node:assert";
import { performance } from "node:perf_hooks";
import { normalizeRemoteObjectResult } from "../browser/remote-object.js";
import { allocateSelectorGroupBudgets } from "../browser/selector-budget.js";
import { errorMessage } from "../value-guards.js";
import { normalizeComboboxComparisonValue, normalizeComboboxSearchValue, } from "./combobox.js";
import { ensureStatusCode, requirePageMethod, validCodes, } from "./controller-support.js";
import { TimeoutError, isTimeoutLike } from "./errors.js";
import { By, selectorFor, } from "./selector.js";
import { Is, } from "./types.js";
export class WebController {
    page;
    defaultTimeout;
    timeSource;
    timeoutConfig;
    timingCollector;
    defaultTimeoutOverride;
    sleepRangeMs;
    randomInt;
    sleeper;
    constructor(page, options = {}) {
        this.page = page;
        this.defaultTimeoutOverride = options.defaultTimeout ?? null;
        this.timeoutConfig = options.timeoutConfig ?? null;
        this.defaultTimeout =
            options.defaultTimeout ?? options.timeoutConfig?.default ?? 5;
        this.timingCollector = options.timingCollector ?? null;
        this.timeSource = options.timeSource ?? (() => performance.now() / 1000);
        this.sleepRangeMs = options.sleepRangeMs ?? [1000, 2500];
        this.randomInt = options.randomInt ?? ((maxExclusive) => Math.floor(Math.random() * maxExclusive));
        this.sleeper = options.sleep ?? ((ms) => this.page.waitForTimeout
            ? this.page.waitForTimeout(ms)
            : new Promise((resolve) => setTimeout(resolve, ms)));
    }
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
    async webExecute(jscode) {
        const evaluate = requirePageMethod(this.page.evaluate, "evaluate");
        const result = await evaluate.call(this.page, jscode);
        return normalizeRemoteObjectResult(result);
    }
    async webRequest(url, method = "GET", validResponseCodes = 200, headers = null) {
        const response = await requirePageMethod(this.page.evaluate, "evaluate").call(this.page, async ({ requestUrl, requestMethod, requestHeaders, }) => {
            const fetchResponse = await fetch(requestUrl, {
                method: requestMethod,
                redirect: "follow",
                headers: requestHeaders,
            });
            const responseHeaders = {};
            fetchResponse.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });
            return {
                statusCode: fetchResponse.status,
                statusMessage: fetchResponse.statusText,
                headers: responseHeaders,
                content: await fetchResponse.text(),
            };
        }, {
            requestUrl: url,
            requestMethod: method.toUpperCase(),
            requestHeaders: headers ?? {},
        });
        const normalized = normalizeRemoteObjectResult(response);
        ensureStatusCode(normalized);
        if (!validCodes(validResponseCodes).has(normalized.statusCode)) {
            throw new assert.AssertionError({
                message: `Invalid response "${normalized.statusCode} ` +
                    `${normalized.statusMessage}" received for HTTP ${method.toUpperCase()} to ${url}`,
            });
        }
        return normalized;
    }
    async webFind(type, value, { parent = null, timeout, } = {}) {
        return this.runWithTimeoutRetries((effectiveTimeout) => this.webFindOnce(type, value, effectiveTimeout, parent), {
            description: `web_find(${type}, ${value})`,
            key: "default",
            timeout,
        });
    }
    async webFindFirstAvailable(selectors, { description, key = "default", parent = null, timeout, } = {}) {
        if (selectors.length === 0) {
            throw new Error("selectors must contain at least one selector");
        }
        return this.runWithTimeoutRetries(async (effectiveTimeout) => {
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
        }, {
            description: description ?? `web_find_first_available(${selectors.length} selectors)`,
            key,
            timeout,
        });
    }
    async webTextFirstAvailable(selectors, { description, key = "default", parent = null, timeout, } = {}) {
        const [element, index] = await this.webFindFirstAvailable(selectors, {
            description,
            key,
            parent,
            timeout,
        });
        return [await this.extractVisibleText(element), index];
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
    async webProbe(type, value, { parent = null, timeout, } = {}) {
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
    async webFindAll(type, value, { parent = null, timeout, } = {}) {
        return this.runWithTimeoutRetries((effectiveTimeout) => this.webFindAllOnce(type, value, effectiveTimeout, parent), {
            description: `web_find_all(${type}, ${value})`,
            key: "default",
            timeout,
        });
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
    async webCheck(type, value, attr, timeout) {
        const element = await this.webFind(type, value, { timeout });
        switch (attr) {
            case Is.CLICKABLE:
                return !(await this.isDisabled(element)) || await this.isDisplayed(element);
            case Is.DISPLAYED:
                return this.isDisplayed(element);
            case Is.DISABLED:
                return this.isDisabled(element);
            case Is.READONLY:
                return element.getAttribute
                    ? (await element.getAttribute("readonly")) !== null
                    : false;
            case Is.SELECTED:
                return this.isSelected(element);
        }
        throw new assert.AssertionError({
            message: `Unsupported attribute: ${String(attr)}`,
        });
    }
    async webClick(type, value, timeout) {
        const element = await this.webFind(type, value, { timeout });
        await requirePageMethod(element.click, "element.click").call(element);
        await this.webSleep();
        return element;
    }
    async clearInput(element) {
        if (element.evaluate && element.press) {
            await element.evaluate("(elem) => { elem.focus(); elem.select(); }");
            await this.webSleep(50, 100);
            await element.press("Backspace");
            return;
        }
        if (element.fill) {
            await element.fill("");
            return;
        }
        if (element.evaluate) {
            await element.evaluate(`
        function (element) {
          element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `);
            return;
        }
        throw new Error("Element does not support clearing input");
    }
    async dispatchArrowDownAndEnter(element) {
        if (element.evaluate) {
            await element.evaluate("(elem) => elem.focus()");
        }
        const press = requirePageMethod(element.press, "element.press");
        await this.webSleep(300, 600);
        await press.call(element, "ArrowDown");
        await this.webSleep(200, 400);
        await press.call(element, "Enter");
    }
    async webInput(type, value, text, timeout) {
        const element = await this.webFind(type, value, { timeout });
        await this.clearInput(element);
        await this.inputText(element, String(text));
        await this.webSleep();
        return element;
    }
    async webText(type, value, { parent = null, timeout, } = {}) {
        const element = await this.webFind(type, value, { parent, timeout });
        return this.extractVisibleText(element);
    }
    async extractVisibleText(element) {
        if (element.evaluate) {
            const text = await element.evaluate(`
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
      `);
            return String(text ?? "");
        }
        if (element.textContent) {
            return (await element.textContent())?.trim() ?? "";
        }
        throw new Error("Element does not support text extraction");
    }
    async webSelect(type, value, selectedValue, timeout) {
        await this.webAwait(() => this.webCheck(type, value, Is.CLICKABLE), {
            timeout,
            timeoutErrorMessage: `No clickable HTML element with selector: ${type}='${value}' found`,
        });
        const element = await this.webFind(type, value, { timeout });
        try {
            await this.selectOption(element, selectedValue);
        }
        catch {
            throw new TimeoutError(`Option not found by value or displayed text: ${selectedValue}`);
        }
        await this.webSleep();
        return element;
    }
    async webSelectCombobox(type, value, selectedValue, timeout) {
        const inputField = await this.webFind(type, value, { timeout });
        const searchValue = normalizeComboboxSearchValue(selectedValue);
        await this.clearInput(inputField);
        await this.inputText(inputField, searchValue);
        await this.webSleep();
        const dropdownId = inputField.getAttribute
            ? await inputField.getAttribute("aria-controls")
            : null;
        let dropdown = null;
        if (dropdownId) {
            dropdown = await this.webFind(By.ID, dropdownId, { timeout });
        }
        else {
            try {
                dropdown = await this.webFind(By.CSS_SELECTOR, '[role="listbox"]', {
                    timeout: this.baseTimeout("quickDom"),
                });
            }
            catch (error) {
                if (!(error instanceof TimeoutError)) {
                    throw error;
                }
            }
        }
        if (!dropdown) {
            return this.confirmComboboxFallback(inputField, searchValue);
        }
        if (await this.clickMatchingComboboxOption(dropdown, searchValue)) {
            await this.webSleep();
            return dropdown;
        }
        return this.confirmComboboxFallback(inputField, searchValue);
    }
    async webSelectButtonCombobox(elementId, selectedValue, timeout) {
        await this.webClick(By.ID, elementId, timeout);
        const listbox = await this.webFind(By.ID, `${elementId}-menu`, { timeout });
        const ok = await this.clickMatchingButtonComboboxOption(listbox, selectedValue);
        if (!ok) {
            throw new TimeoutError(`Option '${selectedValue}' not found in button combobox '${elementId}'`);
        }
        await this.webSleep();
        return listbox;
    }
    async webAwait(condition, { timeout, timeoutErrorMessage = "", applyMultiplier = true, } = {}) {
        const baseTimeout = timeout ?? this.baseTimeout("default");
        const effectiveTimeout = applyMultiplier
            ? this.effectiveTimeout("default", baseTimeout, 0)
            : baseTimeout;
        const startedAt = this.timeSource();
        while (true) {
            let currentError = null;
            try {
                const result = await condition();
                if (result) {
                    return result;
                }
            }
            catch (error) {
                currentError = error;
            }
            const elapsed = this.timeSource() - startedAt;
            if (elapsed >= effectiveTimeout) {
                if (currentError) {
                    throw currentError;
                }
                throw new TimeoutError(timeoutErrorMessage ||
                    `Condition not met within ${effectiveTimeout} seconds`);
            }
            const remainingMs = Math.max(effectiveTimeout - elapsed, 0) * 1000;
            await this.sleeper(Math.min(500, remainingMs));
        }
    }
    async webOpen(url, { timeout, reloadIfAlreadyOpen = false, } = {}) {
        if (!reloadIfAlreadyOpen && this.page.url === url) {
            return;
        }
        const effectiveTimeout = this.effectiveTimeout("pageLoad", timeout, 0);
        const goto = requirePageMethod(this.page.goto, "goto");
        await goto.call(this.page, url, {
            timeout: effectiveTimeout * 1000,
        });
        await this.webAwait(() => this.webExecute("document.readyState == 'complete'"), {
            applyMultiplier: false,
            timeout: effectiveTimeout,
            timeoutErrorMessage: `Page did not finish loading within ${effectiveTimeout} seconds.`,
        });
    }
    async webSleep(minMs, maxMs) {
        const min = minMs ?? this.sleepRangeMs[0];
        const max = maxMs ?? this.sleepRangeMs[1];
        const duration = max <= min ? min : this.randomInt(max - min) + min;
        if (duration > 0) {
            await this.sleeper(duration);
        }
    }
    async webScrollPageDown(scrollLength = 10, scrollSpeed = 10000, { scrollBackTop = false, } = {}) {
        let currentYPos = 0;
        const bottomYPos = Number(await this.webExecute("document.body.scrollHeight"));
        while (currentYPos < bottomYPos) {
            currentYPos += scrollLength;
            await this.webExecute(`window.scrollTo(0, ${currentYPos})`);
            await this.sleeper((scrollLength / scrollSpeed) * 1000);
        }
        if (!scrollBackTop) {
            return;
        }
        while (currentYPos > 0) {
            currentYPos -= scrollLength;
            await this.webExecute(`window.scrollTo(0, ${currentYPos})`);
            await this.sleeper((scrollLength / scrollSpeed / 2) * 1000);
        }
    }
    async isDisabled(element) {
        if (element.isDisabled) {
            return element.isDisabled();
        }
        return element.getAttribute
            ? (await element.getAttribute("disabled")) !== null
            : false;
    }
    async isDisplayed(element) {
        if (element.isVisible) {
            return element.isVisible();
        }
        if (element.evaluate) {
            return Boolean(await element.evaluate(`
        function (element) {
          var style = window.getComputedStyle(element);
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && style.opacity !== '0'
            && element.offsetWidth > 0
            && element.offsetHeight > 0
        }
      `));
        }
        return true;
    }
    async isSelected(element) {
        if (element.evaluate) {
            return Boolean(await element.evaluate(`
        function (element) {
          if (element.tagName.toLowerCase() === 'input') {
            if (element.type === 'checkbox' || element.type === 'radio') {
              return element.checked
            }
          }
          return false
        }
      `));
        }
        return element.isChecked ? element.isChecked() : false;
    }
    async inputText(element, text) {
        if (element.pressSequentially) {
            await element.pressSequentially(text);
        }
        else if (element.type) {
            await element.type(text);
        }
        else if (element.fill) {
            await element.fill(text);
        }
        else {
            throw new Error("Element does not support text input");
        }
    }
    async selectOption(element, selectedValue) {
        if (element.evaluate) {
            const wanted = JSON.stringify(String(selectedValue));
            await element.evaluate(`
        function (element) {
          const wanted = String(${wanted});

          for (let i = 0; i < element.options.length; i++) {
            if (element.options[i].value === wanted) {
              element.selectedIndex = i;
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return;
            }
          }

          const needle = wanted.trim();
          for (let i = 0; i < element.options.length; i++) {
            const opt = element.options[i];
            const shown = (opt.label ?? opt.text ?? opt.textContent ?? '').trim();
            if (shown === needle) {
              element.selectedIndex = i;
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return;
            }
          }

          throw new Error("Option not found by value or displayed text: " + wanted);
        }
      `);
            return;
        }
        const selectOption = requirePageMethod(element.selectOption, "element.selectOption");
        try {
            await selectOption.call(element, String(selectedValue));
        }
        catch {
            await selectOption.call(element, { label: String(selectedValue) });
        }
    }
    async clickMatchingComboboxOption(dropdown, selectedValue) {
        if (dropdown.evaluate) {
            const wanted = JSON.stringify(selectedValue);
            return Boolean(await dropdown.evaluate(`
        function (element) {
          const selected = String(${wanted});
          const normalize = s =>
            (s ?? '').replace(/_+/g, ' ').replace(/\\s+/g, ' ').trim().toLowerCase();
          const items = element.querySelectorAll(':scope > li[role="option"], :scope > li');

          for (const li of items) {
            const labelEl = li.querySelector(':scope > span:last-of-type');
            const label = normalize(labelEl ? labelEl.textContent : li.textContent);
            if (label === normalize(selected)) {
              try {
                li.scrollIntoView({ block: 'nearest' });
              } catch (e) {}
              li.click();
              return true;
            }
          }
          return false;
        }
      `));
        }
        return false;
    }
    async clickMatchingButtonComboboxOption(listbox, selectedValue) {
        if (!listbox.evaluate) {
            throw new Error("Element does not support option lookup");
        }
        const wanted = JSON.stringify(selectedValue);
        return Boolean(await listbox.evaluate(`
      function (element) {
        const normalize = s => (s ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const needle = normalize(${wanted});
        const items = element.querySelectorAll('[role="option"]');
        for (const li of items) {
          if (normalize(li.textContent) === needle) {
            try {
              li.scrollIntoView({ block: 'nearest' });
            } catch (e) {}
            li.click();
            return true;
          }
        }
        return false;
      }
    `));
    }
    async confirmComboboxFallback(inputField, searchValue) {
        await this.dispatchArrowDownAndEnter(inputField);
        await this.webSleep();
        const expected = normalizeComboboxComparisonValue(searchValue);
        const actual = normalizeComboboxComparisonValue(await this.currentInputValue(inputField));
        if (actual !== expected) {
            throw new TimeoutError(`Combobox selected '${actual}' instead of '${expected}'`);
        }
        return inputField;
    }
    async currentInputValue(element) {
        if (element.inputValue) {
            return element.inputValue();
        }
        if (element.evaluate) {
            const value = await element.evaluate("(elem) => (elem.value || '').trim()");
            return String(value ?? "");
        }
        if (element.getAttribute) {
            return await element.getAttribute("value") ?? "";
        }
        return "";
    }
    baseTimeout(key, override) {
        if (this.timeoutConfig) {
            if (override !== null && override !== undefined) {
                return this.timeoutConfig.resolve(key, override);
            }
            if (key === "default" && this.defaultTimeoutOverride !== null) {
                return this.defaultTimeoutOverride;
            }
            return this.timeoutConfig.resolve(key);
        }
        return override ?? this.defaultTimeout;
    }
    effectiveTimeout(key, override, attempt = 0) {
        if (this.timeoutConfig) {
            if (override !== null && override !== undefined) {
                return this.timeoutConfig.effective(key, override, { attempt });
            }
            if (key === "default" && this.defaultTimeoutOverride !== null) {
                return this.defaultTimeoutOverride *
                    this.timeoutConfig.multiplier *
                    (attempt > 0
                        ? this.timeoutConfig.retryBackoffFactor ** attempt
                        : 1);
            }
            return this.timeoutConfig.effective(key, null, { attempt });
        }
        return override ?? this.defaultTimeout;
    }
    timeoutAttempts() {
        return this.timeoutConfig?.attempts() ?? 1;
    }
    recordTiming(key, description, configuredTimeout, effectiveTimeout, actualDuration, attemptIndex, success) {
        if (!this.timingCollector) {
            return;
        }
        const operationType = description.includes("(")
            ? description.split("(", 1)[0] ?? description
            : description;
        try {
            this.timingCollector.record({
                actualDuration,
                attemptIndex,
                configuredTimeout,
                description,
                effectiveTimeout,
                key,
                operationType,
                success,
            });
        }
        catch {
            return;
        }
    }
    async runWithTimeoutRetries(operation, { description, key, timeout, }) {
        const attempts = this.timeoutAttempts();
        const configuredTimeout = this.baseTimeout(key, timeout);
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const effectiveTimeout = this.effectiveTimeout(key, timeout, attempt);
            const startedAt = this.timeSource();
            try {
                const result = await operation(effectiveTimeout);
                this.recordTiming(key, description, configuredTimeout, effectiveTimeout, this.timeSource() - startedAt, attempt, true);
                return result;
            }
            catch (error) {
                if (!isTimeoutLike(error)) {
                    throw error;
                }
                this.recordTiming(key, description, configuredTimeout, effectiveTimeout, this.timeSource() - startedAt, attempt, false);
                if (attempt >= attempts - 1) {
                    throw error;
                }
            }
        }
        throw new TimeoutError(`${description} failed without executing operation`);
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
