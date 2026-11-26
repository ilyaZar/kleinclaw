// Markup cases ported from upstream kleinanzeigen-bot
// tests/integration/test_extend_choice_dialog_dom.py and
// test_delete_csrf_token.py (AGPL-3.0-or-later).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

import {
  callPageScript,
  CSRF_TOKEN_SCRIPT,
  EXTEND_CHOICE_DIALOG_SCRIPT,
} from "../dist/web/page-scripts.js";

function page(body, head = "") {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`,
    { runScripts: "outside-only" },
  );
  // jsdom has no layout; treat everything outside [hidden] as visible.
  dom.window.Element.prototype.getClientRects = function getClientRects() {
    return this.closest("[hidden]") ? [] : [{}];
  };
  const clicks = [];
  dom.window.document.addEventListener("click", (event) => {
    if (event.target.tagName === "BUTTON") {
      clicks.push(event.target.textContent.trim());
    }
  });
  return {
    clicks,
    document: dom.window.document,
    run: (js) => dom.window.eval(js),
  };
}

function extendAction(target, action) {
  return target.run(callPageScript(
    EXTEND_CHOICE_DIALOG_SCRIPT,
    action,
    "Nur verlängern",
    "Anzeige verlängern",
    "erfolgreich verlängert",
    "Vielen Dank",
  ));
}

// "Meine Anzeigen" markup (October 2026), reduced to the relevant structure.
function choiceDialog({ freeChecked = false, paidChecked = false, disabled = false } = {}) {
  return `
<div role="dialog" aria-modal="true">
  <h2>Wie möchtest du deine Anzeige verlängern?</h2>
  <label for="free"><input type="radio" id="free" name="ext" value="extend-only"${freeChecked ? " checked" : ""}> Nur verlängern</label>
  <label for="paid"><input type="radio" id="paid" name="ext" value="extend-bumpup"${paidChecked ? " checked" : ""}>
    Verlängern &amp; Hochschieben für 2,99 €</label>
  <button type="button"${disabled ? " disabled" : ""}>Anzeige verlängern</button>
  <button type="button" aria-label="Schließen">x</button>
</div>`;
}

describe("miniclaw extend choice dialog script", () => {
  it("selects and confirms only the free option", () => {
    const target = page(choiceDialog());
    assert.equal(extendAction(target, "state"), "choice");
    assert.equal(extendAction(target, "select"), "selected");
    assert.equal(target.document.getElementById("free").checked, true);
    assert.equal(target.document.getElementById("paid").checked, false);
    assert.equal(extendAction(target, "confirm"), "clicked");
    assert.deepEqual(target.clicks, ["Anzeige verlängern"]);
  });

  it("refuses to confirm when the paid option gets selected again", () => {
    const target = page(choiceDialog({ paidChecked: true }));
    assert.equal(extendAction(target, "select"), "selected");
    target.document.getElementById("paid").checked = true;
    assert.equal(extendAction(target, "confirm"), "selection-changed");
    assert.deepEqual(target.clicks, []);
  });

  it("reports a disabled confirm button instead of clicking it", () => {
    const target = page(choiceDialog({ freeChecked: true, disabled: true }));
    assert.equal(extendAction(target, "select"), "selected");
    assert.equal(extendAction(target, "confirm"), "confirm-button-disabled");
    assert.deepEqual(target.clicks, []);
  });

  it("recognizes and rejects a paid-only dialog", () => {
    const target = page(`
<div role="dialog" aria-modal="true">
  <h2>Wie möchtest du deine Anzeige verlängern?</h2>
  <label for="paid"><input type="radio" id="paid" name="ext" value="extend-bumpup"> Verlängern &amp; Hochschieben für 2,99 €</label>
  <button type="button">Anzeige verlängern</button>
</div>`);
    assert.equal(extendAction(target, "state"), "choice");
    assert.equal(extendAction(target, "select"), "free-option-not-unique:0/1");
    assert.equal(target.document.getElementById("paid").checked, false);
  });

  it("requires a positive success signal", () => {
    const empty = page("<p>Meine Anzeigen</p>");
    assert.equal(extendAction(empty, "select"), "no-dialog");
    assert.equal(extendAction(empty, "state"), "none");
    const toast = page('<div role="status"><p>Anzeige wurde erfolgreich verlängert.</p></div>');
    assert.equal(extendAction(toast, "state"), "success");
    const classic = page('<div role="dialog"><h2>Vielen Dank!</h2><button aria-label="Schließen">x</button></div>');
    assert.equal(extendAction(classic, "state"), "success");
  });
});

function consentBanner(props) {
  const escaped = JSON.stringify(props).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<div id="consentBanner" data-initialprops="${escaped}"></div>`;
}

const ASTRO_BANNER = consentBanner({
  theme: "desktop",
  webContext: { baseUrl: "https://www.kleinanzeigen.de", csrfToken: "astro-token", userId: "XXX" },
});

describe("miniclaw CSRF token script", () => {
  const cases = [
    ["classic meta", '<meta name="_csrf" content="classic-token">', "", "classic-token"],
    ["astro initialprops", "", ASTRO_BANNER, "astro-token"],
    ["blank meta falls back", '<meta name="_csrf" content="  ">', ASTRO_BANNER, "astro-token"],
    ["skips malformed props", "", `<div data-initialprops="{not json"></div>${ASTRO_BANNER}`, "astro-token"],
    ["blank astro token", "", consentBanner({ webContext: { csrfToken: "" } }), null],
    ["no token", "", "", null],
  ];
  for (const [name, head, body, expected] of cases) {
    it(`reads the token: ${name}`, () => {
      const target = page(body, head);
      assert.equal(target.run(callPageScript(CSRF_TOKEN_SCRIPT)), expected);
    });
  }
});
