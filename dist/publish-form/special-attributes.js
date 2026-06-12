/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { By, TimeoutError, } from "../web-primitives.js";
import { CONDITION_GERMAN_TO_API, CONDITION_TRIGGER_XPATH, } from "./constants.js";
import { clickElement, elementAttribute, inspectSpecialAttributeElement, stringOrNull, xpathLiteral, } from "./element-helpers.js";
const SPECIAL_ATTRIBUTE_TOKEN_RE = /^[A-Za-z0-9_]+$/;
const CHECKBOX_TRUTHY_VALUES = new Set([
    "1",
    "true",
    "yes",
    "on",
    "ja",
    "checked",
]);
const CHECKBOX_FALSY_VALUES = new Set([
    "",
    "0",
    "false",
    "no",
    "off",
    "nein",
    "unchecked",
    "none",
]);
export function normalizeSpecialAttributeKey(key) {
    return key.replace(/_[a-z]+$/, "").split(".").at(-1) ?? "";
}
export function conditionCandidateValues(conditionValue) {
    const mappedValue = CONDITION_GERMAN_TO_API[conditionValue];
    const candidates = [];
    if (mappedValue && mappedValue !== conditionValue) {
        candidates.push(mappedValue);
    }
    if (!candidates.includes(conditionValue)) {
        candidates.push(conditionValue);
    }
    return candidates;
}
export function specialAttributeXPath(key) {
    const normalized = normalizeSpecialAttributeKey(key);
    const idSuffixLiteral = xpathLiteral(`.${normalized}`);
    const nameSuffixLiteral = xpathLiteral(`.${normalized}]`);
    const namePlusLiteral = xpathLiteral(`.${normalized}+`);
    const bareIdLiteral = xpathLiteral(normalized);
    const bareNameLiteral = xpathLiteral(`attributeMap[${normalized}]`);
    const originalKeyLiteral = xpathLiteral(key);
    return ("//*[" +
        `@id=${bareIdLiteral}` +
        " or (contains(@id, '.') and substring(@id, string-length(@id) - " +
        `string-length(${idSuffixLiteral}) + 1) = ${idSuffixLiteral})` +
        ` or @name=${bareNameLiteral}` +
        " or (contains(@name, '.') and substring(@name, string-length(@name) - " +
        `string-length(${nameSuffixLiteral}) + 1) = ${nameSuffixLiteral})` +
        ` or contains(@name, ${namePlusLiteral})` +
        ` or contains(@name, ${originalKeyLiteral})` +
        "]");
}
export function specialAttributeCandidatePriority(info) {
    if (info.localName === "button" && info.role === "combobox") {
        return [0, 0];
    }
    if (info.localName === "input" &&
        (info.type === "text" || info.type === "") &&
        info.role === "combobox") {
        return [1, 0];
    }
    if (info.localName === "select") {
        return [2, 0];
    }
    if (info.type === "checkbox") {
        return [3, 0];
    }
    if ((info.localName === "input" || info.localName === "textarea") &&
        info.type !== "hidden") {
        return [4, 0];
    }
    if (info.type === "hidden") {
        return [9, 1];
    }
    return [8, 0];
}
export async function pickSpecialAttributeCandidate(candidates, specialAttributeKey) {
    if (candidates.length === 0) {
        throw new TimeoutError(`No candidates found for special attribute [${specialAttributeKey}]`);
    }
    const ranked = await Promise.all(candidates.map(async (element, index) => {
        const info = await inspectSpecialAttributeElement(element);
        return {
            element,
            index,
            info,
            priority: specialAttributeCandidatePriority(info),
        };
    }));
    ranked.sort((left, right) => left.priority[0] - right.priority[0] ||
        left.priority[1] - right.priority[1] ||
        left.index - right.index);
    return ranked[0];
}
function desiredCheckboxState(key, value) {
    const normalized = value.trim().toLowerCase();
    if (CHECKBOX_TRUTHY_VALUES.has(normalized)) {
        return true;
    }
    if (CHECKBOX_FALSY_VALUES.has(normalized)) {
        return false;
    }
    throw new TimeoutError(`Failed to set attribute '${key}'`);
}
function currentCheckboxState(checked) {
    if (typeof checked === "boolean") {
        return checked;
    }
    const normalized = checked === null || checked === undefined
        ? ""
        : String(checked).trim().toLowerCase();
    return !CHECKBOX_FALSY_VALUES.has(normalized);
}
export async function setConditionDialog(controller, conditionValue, { quickDomTimeout } = {}) {
    const conditionTrigger = await controller.webProbe(By.XPATH, CONDITION_TRIGGER_XPATH, { timeout: quickDomTimeout });
    if (conditionTrigger === null) {
        return false;
    }
    const triggerId = String(await elementAttribute(conditionTrigger, "id") ?? "");
    const triggerControls = String(await elementAttribute(conditionTrigger, "aria-controls") ?? "");
    if (triggerId.toLowerCase().includes("shipping") ||
        triggerControls.toLowerCase().includes("shipping")) {
        return false;
    }
    try {
        await clickElement(conditionTrigger, "Failed to set attribute 'condition_s'");
        await controller.webFind(By.XPATH, '//*[self::dialog or @role="dialog"]', { timeout: quickDomTimeout });
        let conditionRadio = null;
        for (const candidate of conditionCandidateValues(conditionValue)) {
            conditionRadio = await controller.webProbe(By.XPATH, "//*[self::dialog or @role='dialog']//input" +
                `[@type='radio' and @value=${xpathLiteral(candidate)}]`, { timeout: quickDomTimeout });
            if (conditionRadio !== null) {
                break;
            }
        }
        if (conditionRadio === null) {
            const candidates = conditionCandidateValues(conditionValue).join(", ");
            throw new TimeoutError(`No condition radio matched values ${candidates}`);
        }
        const conditionRadioId = stringOrNull(await elementAttribute(conditionRadio, "id"));
        if (conditionRadioId) {
            try {
                await controller.webClick(By.XPATH, "//*[self::dialog or @role='dialog']" +
                    `//label[@for=${xpathLiteral(conditionRadioId)}]`, quickDomTimeout);
            }
            catch (error) {
                if (!(error instanceof TimeoutError)) {
                    throw error;
                }
                await clickElement(conditionRadio, "Failed to set attribute 'condition_s'");
            }
        }
        else {
            await clickElement(conditionRadio, "Failed to set attribute 'condition_s'");
        }
    }
    catch (error) {
        if (error instanceof TimeoutError) {
            throw new TimeoutError("Failed to set attribute 'condition_s'");
        }
        throw error;
    }
    try {
        await controller.webClick(By.XPATH, '//*[self::dialog or @role="dialog"]//button[.//span[text()="Bestätigen"]]', quickDomTimeout);
    }
    catch (error) {
        if (error instanceof TimeoutError) {
            throw new TimeoutError("Unable to close condition dialog!");
        }
        throw error;
    }
    return true;
}
export async function setSpecialAttributes(controller, specialAttributes, { setCondition } = {}) {
    if (!specialAttributes) {
        return;
    }
    for (const [key, rawValue] of Object.entries(specialAttributes)) {
        let value = String(rawValue);
        const normalizedKey = normalizeSpecialAttributeKey(key);
        if (!SPECIAL_ATTRIBUTE_TOKEN_RE.test(normalizedKey)) {
            throw new TimeoutError(`Failed to set attribute '${key}'`);
        }
        if (normalizedKey === "condition") {
            const conditionHandler = setCondition ??
                ((conditionValue) => setConditionDialog(controller, conditionValue));
            if (await conditionHandler(value)) {
                continue;
            }
            value = CONDITION_GERMAN_TO_API[value] ?? value;
        }
        const xpath = specialAttributeXPath(key);
        let selected;
        try {
            const candidates = await controller.webFindAll(By.XPATH, xpath);
            selected = await pickSpecialAttributeCandidate(candidates, key);
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                throw new TimeoutError(`Failed to set attribute '${key}'`);
            }
            throw error;
        }
        const selectorType = selected.info.id ? By.ID : By.XPATH;
        const selectorValue = selected.info.id ?? xpath;
        try {
            if (selected.info.localName === "select") {
                await controller.webSelect(selectorType, selectorValue, value);
            }
            else if (selected.info.type === "checkbox") {
                const desiredChecked = desiredCheckboxState(key, value);
                if (desiredChecked !== currentCheckboxState(selected.info.checked)) {
                    await controller.webClick(selectorType, selectorValue);
                }
            }
            else if (selected.info.localName === "button" &&
                selected.info.role === "combobox") {
                if (!selected.info.id) {
                    throw new TimeoutError(`Failed to set attribute '${key}'`);
                }
                await selectButtonComboboxByValue(controller, selected.info.id, value);
            }
            else if (selected.info.localName === "input" &&
                selected.info.role === "combobox" &&
                (selected.info.type === "text" || selected.info.type === "")) {
                await controller.webSelectCombobox(selectorType, selectorValue, value);
            }
            else {
                await controller.webInput(selectorType, selectorValue, value);
            }
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                throw new TimeoutError(`Failed to set attribute '${key}'`);
            }
            throw error;
        }
    }
}
async function selectButtonComboboxByValue(controller, elementId, value) {
    await controller.webClick(By.ID, elementId);
    const listboxId = `${elementId}-menu`;
    await controller.webFind(By.ID, listboxId);
    const jsButtonId = JSON.stringify(elementId);
    const jsListboxId = JSON.stringify(listboxId);
    const jsValue = JSON.stringify(value);
    const ok = await controller.webExecute(`(function() {
    const listbox = document.getElementById(${jsListboxId});
    if (!listbox) return false;
    const liOptions = Array.from(listbox.querySelectorAll('[role="option"]'));
    const btnEl = document.getElementById(${jsButtonId});
    if (!btnEl) return false;
    const fiberKey = Object.keys(btnEl).find(k => k.startsWith('__reactFiber'));
    let fiber = fiberKey ? btnEl[fiberKey] : null;
    for (let i = 0; i < 20 && fiber; i++, fiber = fiber.return) {
      if (fiber.memoizedProps && fiber.memoizedProps.options) {
        const optionsData = fiber.memoizedProps.options;
        for (let j = 0; j < optionsData.length; j++) {
          if (optionsData[j].value === ${jsValue} && liOptions[j]) {
            liOptions[j].click();
            return true;
          }
        }
        return false;
      }
    }
    return false;
  })()`);
    if (!ok) {
        throw new TimeoutError(`Option '${value}' not found in button combobox '${elementId}'`);
    }
}
