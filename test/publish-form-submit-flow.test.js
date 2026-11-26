import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

import { AdUpdateStrategy } from "../dist/model/ad-model.js";
import { VISIBILITY_UPSELL_SKIP_BUTTON_XPATH } from "../dist/publish-form/publish-form-constants.js";
import { submitAdForm } from "../dist/publish-form/publish-form-submit-flow.js";
import { recoverNewPublishedAdId } from "../dist/published-ads.js";
import {
  callPageScript,
  FORM_VALIDATION_ERRORS_SCRIPT,
  IDLESS_SUCCESS_PAGE_SCRIPT,
} from "../dist/web/page-scripts.js";
import { By } from "../dist/web-primitives.js";

const FORM_URL = "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html";

// Fake page: answers the location, the page scripts, and the update marker.
function submitController({
  afterClick = () => {},
  errors = [],
  idless = false,
  snapshot = null,
  upsell = false,
} = {}) {
  const events = [];
  const page = { url: FORM_URL };
  const controller = {
    async webClick(type, value) {
      events.push("submit");
      afterClick(page);
    },
    async webExecute(script) {
      if (script === "window.location.href") return page.url;
      if (script === "document.referrer") return "";
      if (script.includes("pageType")) return snapshot;
      if (script.includes("Geschafft!")) return idless;
      if (script.includes("aria-invalid")) return errors;
      return "";
    },
    async webProbe(type, value) {
      if (upsell && type === By.XPATH && value === VISIBILITY_UPSELL_SKIP_BUTTON_XPATH) {
        return {
          async click() {
            events.push("skip-upsell");
            page.url = "https://www.kleinanzeigen.de/p-anzeige-aufgeben-bestaetigung.html?adId=3431202334";
          },
        };
      }
      return null;
    },
    async webSleep() {},
  };
  return { controller, events };
}

const options = { confirmationTimeout: 1, quickDomTimeout: 0 };

describe("miniclaw submit flow", () => {
  it("declines the 'Effektiver verkaufen' upsell before waiting for confirmation", async () => {
    assert.match(VISIBILITY_UPSELL_SKIP_BUTTON_XPATH, /Ohne Top-Anzeige weiter/);
    assert.match(VISIBILITY_UPSELL_SKIP_BUTTON_XPATH, /Ohne Hochschieben weiter/);
    const { controller, events } = submitController({ upsell: true });

    assert.equal(await submitAdForm(controller, { images: ["a.jpg"] }, options), 3431202334);
    assert.deepEqual(events, ["submit", "skip-upsell"]);
  });

  it("recovers the ID when the publish success page shows none", async () => {
    const { controller } = submitController({ idless: true });
    const adId = await submitAdForm(controller, { images: [] }, {
      ...options,
      recoverIdlessAdId: async () => 777,
    });
    assert.equal(adId, 777);
  });

  it("reports an uncertain publish when the new ID cannot be recovered", async () => {
    const { controller } = submitController({ idless: true });
    await assert.rejects(
      submitAdForm(controller, { images: [] }, { ...options, recoverIdlessAdId: async () => null }),
      /publish succeeded but no ad ID could be recovered/,
    );
  });

  it("accepts the update success page only for the submitted ad", async () => {
    const referrer = "https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=42";
    const matching = submitController({ snapshot: { pageType: "EditAdSuccess", referrer } });
    assert.equal(
      await submitAdForm(matching.controller, { images: [] }, {
        ...options,
        configuredAdId: 42,
        mode: AdUpdateStrategy.Modify,
      }),
      42,
    );

    const other = submitController({ snapshot: { pageType: "EditAdSuccess", referrer } });
    await assert.rejects(
      submitAdForm(other.controller, { images: [] }, {
        ...options,
        configuredAdId: 43,
        mode: AdUpdateStrategy.Modify,
      }),
      /submission may have succeeded/,
    );
  });

  it("fails without retry on explicit form validation errors", async () => {
    const { controller } = submitController({ errors: ["Titel: Bitte gib einen Titel ein."] });
    await assert.rejects(
      submitAdForm(controller, { images: [] }, options),
      (error) => error.name === "AdFormValidationError" &&
        /Titel: Bitte gib einen Titel ein\./.test(error.message),
    );
  });
});

describe("miniclaw published ad ID recovery", () => {
  const sleep = async () => {};

  it("returns the one new exact-title ad", async () => {
    const ads = [
      { id: 1, title: "Tisch &amp; Stühle" },
      { id: 2, title: "Tisch & Stühle" },
      { id: 3, title: "Lampe" },
    ];
    const id = await recoverNewPublishedAdId(async () => ads, {
      knownIds: new Set([1]),
      sleep,
      title: "Tisch & Stühle",
    });
    assert.equal(id, 2);
  });

  it("refuses ambiguous candidates and retries until the ad appears", async () => {
    const ambiguous = await recoverNewPublishedAdId(
      async () => [{ id: 5, title: "Lampe" }, { id: 6, title: "Lampe" }],
      { knownIds: new Set(), sleep, title: "Lampe" },
    );
    assert.equal(ambiguous, null);

    let calls = 0;
    const later = await recoverNewPublishedAdId(async () => {
      calls += 1;
      if (calls === 1) throw new Error("incomplete");
      return calls < 3 ? [] : [{ id: 9, title: "Lampe" }];
    }, { knownIds: new Set(), sleep, title: "Lampe" });
    assert.equal(later, 9);
  });
});

function page(body) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${body}</body>`, { runScripts: "outside-only" });
  dom.window.Element.prototype.getClientRects = function getClientRects() {
    return this.closest("[hidden]") ? [] : [{}];
  };
  return (js) => JSON.parse(JSON.stringify(dom.window.eval(js)));
}

describe("miniclaw submit page scripts", () => {
  it("detects the success page without an ad ID", () => {
    const success = page('<h1>Geschafft!</h1><a href="/m-meine-anzeigen.html">Zu meinen Anzeigen</a>');
    assert.equal(success(callPageScript(IDLESS_SUCCESS_PAGE_SCRIPT)), true);
    const form = page("<h1>Anzeige aufgeben</h1>");
    assert.equal(form(callPageScript(IDLESS_SUCCESS_PAGE_SCRIPT)), false);
  });

  it("reads visible field errors with their labels", () => {
    const run = page(`
      <form>
        <label for="ad-title">Titel</label>
        <input id="ad-title" aria-invalid="true" aria-errormessage="ad-title-error">
        <p id="ad-title-error">Bitte gib einen Titel ein.</p>
        <div><label for="price">Preis</label><input id="price" aria-invalid="true" aria-describedby="price-hint"></div>
        <p id="price-hint">Nur ein Hinweis</p>
        <p id="attribute-error">Bitte wähle eine Größe.</p>
        <p id="hidden-error" hidden>Unsichtbar</p>
      </form>`);
    assert.deepEqual(run(callPageScript(FORM_VALIDATION_ERRORS_SCRIPT)), [
      "Titel: Bitte gib einen Titel ein.",
      "Bitte wähle eine Größe.",
    ]);
  });
});
