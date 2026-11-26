/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { normalizeComboboxComparisonValue, normalizeComboboxSearchValue, } from "./combobox.js";
import { ControllerElementInteraction } from "./controller-element-interaction.js";
import { normalizeRemoteObjectResult } from "../browser/browser-remote-object.js";
import { isRecord } from "../value-guards.js";
import { requirePageMethod } from "./controller-support.js";
import { TimeoutError } from "./errors.js";
import { By } from "./selector.js";
import { callPageScript, SELECT_BUTTON_COMBOBOX_SCRIPT } from "./page-scripts.js";
import { Is } from "./types.js";
export class ControllerSelectionControls extends ControllerElementInteraction {
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
        const pollMs = Math.max(1, Math.trunc(this.effectiveTimeout("quickDom", timeout, 0) * 1000));
        const evaluate = requirePageMethod(this.page.evaluate, "evaluate");
        const status = normalizeRemoteObjectResult(await evaluate.call(this.page, callPageScript(SELECT_BUTTON_COMBOBOX_SCRIPT, elementId, selectedValue, pollMs)));
        if (!isRecord(status) || status.ok !== true) {
            const reason = isRecord(status) ? String(status.reason ?? "unknown") : "unknown";
            const offered = isRecord(status) && Array.isArray(status.options)
                ? status.options.join(", ")
                : "";
            throw new TimeoutError(`Option '${selectedValue}' not found in button combobox '${elementId}': ` +
                `${reason}${offered ? ` (offered: ${offered})` : ""}`);
        }
        await this.webSleep();
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
}
