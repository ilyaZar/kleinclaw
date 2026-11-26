/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

// In-page scripts, one function expression each, called with JSON arguments
// through `callPageScript`. Keeping them as whole sources keeps them diffable
// against the scripts they were ported from (`resources/js/`).

// The classic manage-ads page exposes the CSRF token as <meta name="_csrf">;
// the redesigned (Astro) page only carries it in the JSON `data-initialprops`
// attribute (e.g. #consentBanner) as webContext.csrfToken.
export const CSRF_TOKEN_SCRIPT = String.raw`() => {
  const meta = document.querySelector('meta[name="_csrf"]')?.getAttribute("content");
  if (meta && meta.trim()) return meta;
  for (const el of document.querySelectorAll("[data-initialprops]")) {
    try {
      const token = JSON.parse(el.getAttribute("data-initialprops"))?.webContext?.csrfToken;
      if (typeof token === "string" && token.trim()) return token;
    } catch {
      // ignore elements with malformed props
    }
  }
  return null;
}`;

// Extension choice dialog ("Wie möchtest du deine Anzeige verlängern?").
// The dialog is recognized by its radio group, so a dialog offering only the
// paid option is still a choice dialog and gets rejected by "select". The paid
// option (value "extend-bumpup", label with a price or "Hochschieben") must
// never be selected. "state" returns "choice", "success" (toast or classic
// "Vielen Dank" dialog) or "none"; only "success" is a positive signal.
export const EXTEND_CHOICE_DIALOG_SCRIPT = String.raw`(action, freeText, confirmText, successText, classicSuccessText) => {
  const doc = globalThis.document;
  const paid = /€|hochschieben/i;
  const paidValue = "extend-bumpup";
  const radioSelector = 'input[type="radio"], [role="radio"]';
  const dialogSelector = 'dialog[open], [role="dialog"], [aria-modal="true"]';
  const visible = (element) => element.getClientRects().length > 0;
  const openDialogs = [...doc.querySelectorAll(dialogSelector)].filter(visible);
  const choiceDialogs = openDialogs.filter((dialog) => dialog.querySelector(radioSelector) !== null);
  const dialog = choiceDialogs[choiceDialogs.length - 1];

  if (action === "state") {
    if (dialog) return "choice";
    const toast = (doc.body?.innerText ?? doc.body?.textContent ?? "").includes(successText);
    const classic = openDialogs.some((element) => (element.textContent || "").includes(classicSuccessText));
    return toast || classic ? "success" : "none";
  }
  if (!dialog) return "no-dialog";

  const options = [...dialog.querySelectorAll(radioSelector)];
  const labelOf = (option) => {
    if (option.id) {
      const label = [...dialog.querySelectorAll("label")].find((item) => item.htmlFor === option.id);
      if (label) return label.textContent || "";
    }
    let element = option;
    while (element && element !== dialog) {
      if (element.querySelectorAll(radioSelector).length > 1) break;
      if ((element.textContent || "").trim()) return element.textContent || "";
      element = element.parentElement;
    }
    return option.getAttribute("aria-label") || "";
  };
  const isChecked = (option) => option.checked === true || option.getAttribute("aria-checked") === "true";
  const value = (option) => option.tagName === "INPUT" ? option.value : option.getAttribute("value");
  const free = options.filter((option) =>
    value(option) !== paidValue &&
    (value(option) === "extend-only" || labelOf(option).includes(freeText)) &&
    !paid.test(labelOf(option))
  );
  const others = options.filter((option) => !free.includes(option));

  if (action === "select") {
    if (free.length !== 1) return "free-option-not-unique:" + free.length + "/" + options.length;
    if (!isChecked(free[0])) free[0].click();
    if (!isChecked(free[0])) return "free-option-not-selected";
    if (others.some(isChecked)) return "paid-option-selected";
    return "selected";
  }

  // confirm: recheck the selection atomically with the single click
  if (free.length !== 1 || !isChecked(free[0]) || others.some(isChecked)) return "selection-changed";
  const buttons = [...dialog.querySelectorAll("button")].filter((button) => {
    const text = (button.textContent || "").trim();
    return text.includes(confirmText) && !paid.test(text);
  });
  if (buttons.length !== 1) return "confirm-button-not-unique:" + buttons.length;
  const button = buttons[0];
  if (button.disabled || button.getAttribute("aria-disabled") === "true") return "confirm-button-disabled";
  button.click();
  return "clicked";
}`;

// Redesigned category dialog ("Kategorie wählen"). Choices are
// `li > button`; their labels drop sr-only parts such as
// ", öffnet Unterkategorien". The selected leaf carries aria-pressed="true".
// Actions: "probe" (dialog open?), "offered" (choice labels), "pressed"
// (selected labels), "click" (click the one choice labelled `label`),
// "apply" (click the one enabled "Übernehmen"/"Apply" button).
export const CATEGORY_DIALOG_SCRIPT = String.raw`(action, label) => {
  const titles = ["Kategorie wählen", "Choose category"];
  const visible = (element) => element.getClientRects().length > 0;
  const text = (element) => (element.textContent || "").replace(/\s+/g, " ").trim();
  const dialogs = [...document.querySelectorAll('dialog[open], [role="dialog"]:not([aria-hidden="true"])')]
    .filter((dialog) => visible(dialog) && titles.some((title) => text(dialog).includes(title)));
  const dialog = dialogs[dialogs.length - 1];
  if (action === "probe") return Boolean(dialog);
  if (!dialog) return null;
  const labelOf = (element) => {
    const copy = element.cloneNode(true);
    for (const part of copy.querySelectorAll('.sr-only, [aria-hidden="true"]')) part.remove();
    return text(copy);
  };
  const choices = [...dialog.querySelectorAll("li > button")].filter(visible);
  if (action === "offered") return choices.map(labelOf).filter(Boolean);
  if (action === "pressed") {
    return choices.filter((button) => button.getAttribute("aria-pressed") === "true").map(labelOf);
  }
  if (action === "click") {
    const matches = choices.filter((button) => labelOf(button) === label);
    if (matches.length !== 1) return "choice-not-unique:" + matches.length;
    matches[0].click();
    return "clicked";
  }
  if (action === "apply") {
    const buttons = [...dialog.querySelectorAll("button")]
      .filter((button) => ["Übernehmen", "Apply"].includes(text(button)));
    if (buttons.length !== 1) return "apply-not-unique:" + buttons.length;
    if (buttons[0].disabled || buttons[0].getAttribute("aria-disabled") === "true") return "apply-disabled";
    buttons[0].click();
    return "clicked";
  }
  return null;
}`;

// Calls one of the post-ad page's own category tree actions. The answer is a
// devalue document: a flat array whose first entry is the root and whose
// numbers index into that array.
export const CATEGORY_TREE_ACTION_SCRIPT = String.raw`async (action, body, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch("/_actions/postListingWeb.categoryTree." + action + "/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    return { statusCode: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) return { statusCode: response.status, data: null };
  const flat = JSON.parse(await response.text());
  const memo = new Map();
  const hydrate = (index) => {
    if (index < 0) return undefined;
    if (memo.has(index)) return memo.get(index);
    const value = flat[index];
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      // tagged values (dates, sets, ...) are not part of the category data
      if (typeof value[0] === "string") return null;
      const list = [];
      memo.set(index, list);
      for (const item of value) list.push(hydrate(item));
      return list;
    }
    const record = {};
    memo.set(index, record);
    for (const [key, item] of Object.entries(value)) record[key] = hydrate(item);
    return record;
  };
  return { statusCode: response.status, data: hydrate(0) };
}`;

// Open a <button role="combobox"> with the full pointer sequence and click
// the option matching an API value: React option props first, then option
// attributes, then normalized text. The listbox may be `#<id>-menu`, inside
// the parent, linked via aria-controls/aria-owns, or a visible portal.
export const SELECT_BUTTON_COMBOBOX_SCRIPT = String.raw`async (elemId, value, pollDeadlineMs) => {
  const btn = document.getElementById(elemId);
  if (!btn) return { ok: false, reason: "button_not_found" };
  btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  let options = null;
  const pollDeadline = Date.now() + pollDeadlineMs;
  while (Date.now() < pollDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    let candidate = document.getElementById(elemId + "-menu");
    if (!candidate && btn.parentElement) candidate = btn.parentElement.querySelector('[role="listbox"]');
    if (!candidate && btn.parentElement) candidate = btn.parentElement.querySelector('[role="menu"]');
    const controlledId = btn.getAttribute("aria-controls");
    if (!candidate && controlledId) candidate = document.getElementById(controlledId);
    const ownedId = btn.getAttribute("aria-owns");
    if (!candidate && ownedId) candidate = document.getElementById(ownedId);
    if (!candidate) {
      for (const portal of document.querySelectorAll('[role="listbox"],[role="menu"]')) {
        const rect = portal.getBoundingClientRect();
        const labelledby = portal.getAttribute("aria-labelledby");
        if (rect.width > 0 && rect.height > 0 && (!labelledby || labelledby === btn.id)) {
          candidate = portal;
          break;
        }
      }
    }
    if (candidate) {
      options = [...candidate.querySelectorAll('[role="option"]')];
      if (options.length > 0) break;
    }
  }
  if (!options || options.length === 0) return { ok: false, reason: "no_options_after_opening", options: [] };
  const normalize = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
  const fiberKey = Object.keys(btn).find((key) => key.startsWith("__reactFiber"));
  let fiber = fiberKey ? btn[fiberKey] : null;
  for (let depth = 0; depth < 20 && fiber; depth += 1, fiber = fiber.return) {
    if (fiber.memoizedProps && fiber.memoizedProps.options) {
      const props = fiber.memoizedProps.options;
      for (let index = 0; index < props.length; index += 1) {
        if (props[index].value === value && options[index]) {
          options[index].click();
          return { ok: true };
        }
      }
      break;
    }
  }
  for (const option of options) {
    const attributes = ["value", "data-value", "aria-label", "title"].map((name) => option.getAttribute(name));
    if (attributes.includes(value) || normalize(option.textContent).toLowerCase() === normalize(value).toLowerCase()) {
      option.click();
      return { ok: true };
    }
  }
  return { ok: false, reason: "option_not_found", options: options.map((option) => normalize(option.textContent)) };
}`;

// The id of the <button role="combobox"> that belongs to a hidden
// `attributeMap[...]` input: the id named in the brackets, else the nearest
// combobox up to eight ancestors away.
export const FIND_ASSOCIATED_BUTTON_COMBOBOX_SCRIPT = String.raw`(hiddenInputName) => {
  const input = document.querySelector("input[type='hidden'][name=" + JSON.stringify(hiddenInputName) + "]");
  if (!input) return null;
  const match = hiddenInputName.match(/^attributeMap\[(.+)\]$/);
  if (match) {
    const button = document.getElementById(match[1]);
    if (button && button.tagName === "BUTTON" && button.getAttribute("role") === "combobox") return match[1];
  }
  let parent = input.parentElement;
  for (let depth = 0; depth < 8 && parent; depth += 1, parent = parent.parentElement) {
    const button = parent.querySelector('button[role="combobox"]');
    if (button && button.id) return button.id;
  }
  return null;
}`;

// Mark the condition dialog trigger, a dialog button sharing an ancestor with
// label[for*=".condition"], with data-miniclaw-condition-trigger.
export const CONDITION_DIALOG_TRIGGER_SCRIPT = String.raw`() => {
  for (const element of document.querySelectorAll("[data-miniclaw-condition-trigger]")) {
    element.removeAttribute("data-miniclaw-condition-trigger");
  }
  for (const label of document.querySelectorAll('label[for*=".condition"]')) {
    let ancestor = label.parentElement;
    for (let depth = 0; depth < 5 && ancestor; depth += 1, ancestor = ancestor.parentElement) {
      const button = ancestor.querySelector('button[aria-haspopup="dialog"], button[aria-haspopup="true"]');
      if (button) {
        button.setAttribute("data-miniclaw-condition-trigger", "true");
        return { found: true, id: button.id || "", ariaControls: button.getAttribute("aria-controls") || "" };
      }
    }
  }
  return { found: false };
}`;

// The redesigned publish success page shows no ad ID.
export const IDLESS_SUCCESS_PAGE_SCRIPT = String.raw`() => {
  const text = (element) => (element.innerText ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
  const hasManageAdsControl = [...document.querySelectorAll("a, button")]
    .some((element) => text(element).includes("Zu meinen Anzeigen"));
  return Boolean(document.body) && text(document.body).includes("Geschafft!") && hasManageAdsControl;
}`;

// Visible field errors of the ad form, as "label: message", without reading
// field values. Covers aria-invalid/:invalid fields with their
// aria-errormessage/aria-describedby texts, adjacent statuses, and every
// visible [id$="-error"] element.
export const FORM_VALIDATION_ERRORS_SCRIPT = String.raw`() => {
  const form = document.getElementById("ad-title")?.closest("form");
  if (!form) return [];
  const visible = (element) =>
    element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  const text = (element) => ((element && (element.innerText ?? element.textContent)) || "").replace(/\s+/g, " ").trim();
  const labels = [...form.querySelectorAll("label")];
  const labelFor = (element) => {
    let scope = element;
    for (let depth = 0; depth < 6 && scope && scope !== form; depth += 1, scope = scope.parentElement) {
      const controls = [scope, ...scope.querySelectorAll("input[id], select[id], textarea[id], button[id]")];
      const matches = new Set();
      for (const control of controls) {
        const label = labels.find((candidate) => control.id && candidate.htmlFor === control.id);
        if (label && text(label)) matches.add(text(label));
      }
      if (matches.size === 1) return [...matches][0];
      if (matches.size > 1) break;
      const localLabels = scope.querySelectorAll("label");
      if (localLabels.length === 1) return text(localLabels[0]);
    }
    return element.matches("input, select, textarea, button") ? element.getAttribute("name") || element.id || "" : "";
  };
  const errors = new Set();
  const reported = new Set();
  const add = (element, message) => {
    if (!message) return;
    const label = labelFor(element);
    errors.add(label ? label + ": " + message : message);
  };
  for (const field of form.querySelectorAll('[aria-invalid="true"], input:invalid, select:invalid, textarea:invalid')) {
    if (!visible(field)) continue;
    const errorReferences = field.getAttribute("aria-errormessage");
    const references = errorReferences ||
      (field.getAttribute("aria-invalid") === "true" ? field.getAttribute("aria-describedby") : "") || "";
    const messages = references.trim().split(/\s+/).filter(Boolean).map((id) => document.getElementById(id))
      .filter((element) => element && form.contains(element) && visible(element))
      // descriptions can be hints; only error-like elements count
      .filter((element) => errorReferences ||
        element.matches('[id$="-error"], [role="alert"], [role="status"], .text-critical'))
      .map((element) => {
        reported.add(element);
        return text(element);
      }).filter(Boolean);
    if (!messages.length && !field.validationMessage && field.getAttribute("aria-invalid") === "true") {
      // an adjacent status without ARIA reference, inside a single-input container
      for (let scope = field.parentElement; scope && scope !== form; scope = scope.parentElement) {
        const controls = [...scope.querySelectorAll("input, select, textarea, button")].filter(visible);
        if (controls.length !== 1) break;
        const statuses = [...scope.querySelectorAll('[role="status"], [role="alert"]')].filter(visible);
        if (statuses.some((status) => text(status))) {
          for (const status of statuses) {
            reported.add(status);
            if (text(status)) messages.push(text(status));
          }
          break;
        }
      }
    }
    add(field, messages.join(" ") || field.validationMessage);
  }
  for (const error of form.querySelectorAll('[id$="-error"]')) {
    if (visible(error) && !reported.has(error)) add(error, text(error));
  }
  return [...errors];
}`;

// The props of the Astro island that holds the ad data on redesigned ad
// pages, or null.
export const AD_ISLAND_PROPS_SCRIPT = String.raw`() => {
  for (const island of document.querySelectorAll("astro-island")) {
    const props = island.getAttribute("props") || "";
    if (props.includes("imageDetails") || props.includes("formattedCreationDate") || props.includes("userDetails")) {
      return props;
    }
  }
  return null;
}`;

export function callPageScript(source: string, ...args: unknown[]): string {
  return `(${source})(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
}
