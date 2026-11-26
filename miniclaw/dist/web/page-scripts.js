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
export const CSRF_TOKEN_SCRIPT = String.raw `() => {
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
export const EXTEND_CHOICE_DIALOG_SCRIPT = String.raw `(action, freeText, confirmText, successText, classicSuccessText) => {
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
export function callPageScript(source, ...args) {
    return `(${source})(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
}
