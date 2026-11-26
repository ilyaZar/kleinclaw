import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

import {
  setConditionDialog,
  setSpecialAttributes,
} from "../dist/publish-form/publish-form-special-attributes.js";
import {
  callPageScript,
  CONDITION_DIALOG_TRIGGER_SCRIPT,
  FIND_ASSOCIATED_BUTTON_COMBOBOX_SCRIPT,
  SELECT_BUTTON_COMBOBOX_SCRIPT,
} from "../dist/web/page-scripts.js";
import { TimeoutError } from "../dist/web-primitives.js";

function attributeController({ candidates, execute = async () => null } = {}) {
  const calls = [];
  const controller = {
    async webClick(type, value) {
      calls.push(["click", type, value]);
    },
    async webExecute(script) {
      calls.push(["execute"]);
      return execute(script);
    },
    async webFind() {
      return {};
    },
    async webFindAll() {
      return candidates;
    },
    async webInput() {
      throw new Error("webInput should not be called");
    },
    async webProbe() {
      return null;
    },
    async webSelect() {
      throw new Error("webSelect should not be called");
    },
    async webSelectButtonCombobox(id, value) {
      calls.push(["combobox", id, value]);
    },
    async webSelectCombobox() {
      throw new Error("webSelectCombobox should not be called");
    },
  };
  return { calls, controller };
}

function element(attrs, localName) {
  return { attrs, localName };
}

describe("miniclaw special attributes", () => {
  it("selects button combobox attributes through the shared combobox helper", async () => {
    const { calls, controller } = attributeController({
      candidates: [element({ id: "wohnzimmer.art_s", role: "combobox", type: "button" }, "button")],
    });

    await setSpecialAttributes(controller, { "wohnzimmer.art_s": "weinregale" });

    assert.deepEqual(calls, [["combobox", "wohnzimmer.art_s", "weinregale"]]);
  });

  it("falls back from a hidden attributeMap input to its button combobox", async () => {
    const { calls, controller } = attributeController({
      candidates: [element({ name: "attributeMap[farbe]", type: "hidden" }, "input")],
      execute: async (script) => {
        assert.match(script, /"attributeMap\[farbe\]"/);
        return "farbe-button";
      },
    });

    await setSpecialAttributes(controller, { "kleidung.farbe_s": "blau" });

    assert.deepEqual(calls.at(-1), ["combobox", "farbe-button", "blau"]);
  });

  it("maps combined child-clothing sizes to 'andere_groesse'", async () => {
    const { calls, controller } = attributeController({
      candidates: [element({ id: "groesse", role: "combobox", type: "button" }, "button")],
    });

    await setSpecialAttributes(controller, { "baby_kinderkleidung.groesse_s": "158/164" });

    assert.deepEqual(calls, [["combobox", "groesse", "andere_groesse"]]);
  });

  it("wraps a failed combobox selection as an attribute timeout", async () => {
    const { controller } = attributeController({
      candidates: [element({ id: "wohnzimmer.art_s", role: "combobox", type: "button" }, "button")],
    });
    controller.webSelectButtonCombobox = async () => {
      throw new TimeoutError("option_not_found");
    };

    await assert.rejects(
      () => setSpecialAttributes(controller, { "wohnzimmer.art_s": "weinregale" }),
      (error) =>
        error instanceof TimeoutError &&
        error.message === "Failed to set attribute 'wohnzimmer.art_s'",
    );
  });

  it("skips the condition dialog when the trigger belongs to shipping", async () => {
    const { calls, controller } = attributeController({
      execute: async () => ({ ariaControls: "ad-shipping-options", found: true, id: "" }),
    });

    assert.equal(await setConditionDialog(controller, "ok"), false);
    assert.equal(calls.some(([kind]) => kind === "click"), false);
  });
});

function page(body) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${body}</body>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  dom.window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return this.closest("[hidden]") ? { height: 0, width: 0 } : { height: 10, width: 10 };
  };
  const clicked = [];
  dom.window.document.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) {
      clicked.push(option.textContent.trim());
    }
  });
  // jsdom objects live in another realm; compare them as plain JSON.
  const plain = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
  const run = (js) => {
    const result = dom.window.eval(js);
    return result && typeof result.then === "function" ? result.then(plain) : plain(result);
  };
  return { clicked, dom, run };
}

function selectScript(id, value) {
  return callPageScript(SELECT_BUTTON_COMBOBOX_SCRIPT, id, value, 200);
}

describe("miniclaw combobox page scripts", () => {
  it("matches the API value through React option props", async () => {
    const target = page(`
      <button id="art" role="combobox"></button>
      <ul id="art-menu"><li role="option">Regal</li><li role="option">Weinregal</li></ul>`);
    const button = target.dom.window.document.getElementById("art");
    button.__reactFiber$test = {
      memoizedProps: {},
      return: { memoizedProps: { options: [{ value: "regale" }, { value: "weinregale" }] } },
    };

    assert.deepEqual(await target.run(selectScript("art", "weinregale")), { ok: true });
    assert.deepEqual(target.clicked, ["Weinregal"]);
  });

  it("finds a portal listbox through aria-controls and matches text", async () => {
    const target = page(`
      <button id="farbe" role="combobox" aria-controls="portal"></button>
      <div id="portal" role="listbox"><div role="option">Blau</div><div role="option">Grün</div></div>`);

    assert.deepEqual(await target.run(selectScript("farbe", "grün")), { ok: true });
    assert.deepEqual(target.clicked, ["Grün"]);
  });

  it("reports the offered options when nothing matches", async () => {
    const target = page(`
      <button id="farbe" role="combobox"></button>
      <ul id="farbe-menu"><li role="option" data-value="blau">Blau</li></ul>`);

    const status = await target.run(selectScript("farbe", "rot"));
    assert.equal(status.ok, false);
    assert.equal(status.reason, "option_not_found");
    assert.deepEqual(status.options, ["Blau"]);
  });

  it("finds the combobox that belongs to a hidden attributeMap input", () => {
    const named = page(`
      <input type="hidden" name="attributeMap[farbe]">
      <button id="farbe" role="combobox"></button>`);
    assert.equal(named.run(callPageScript(FIND_ASSOCIATED_BUTTON_COMBOBOX_SCRIPT, "attributeMap[farbe]")), "farbe");

    const nearby = page(`
      <div><div><input type="hidden" name="attributeMap[x]"></div><button id="other" role="combobox"></button></div>`);
    assert.equal(nearby.run(callPageScript(FIND_ASSOCIATED_BUTTON_COMBOBOX_SCRIPT, "attributeMap[x]")), "other");
  });

  it("marks the condition dialog trigger next to the condition label", () => {
    const target = page(`
      <div><label for="moebel.condition">Zustand</label>
      <div><button id="cond" aria-haspopup="dialog" aria-controls="cond-dialog">Wählen</button></div></div>`);

    assert.deepEqual(
      target.run(callPageScript(CONDITION_DIALOG_TRIGGER_SCRIPT)),
      { ariaControls: "cond-dialog", found: true, id: "cond" },
    );
    assert.equal(
      target.dom.window.document.getElementById("cond").getAttribute("data-miniclaw-condition-trigger"),
      "true",
    );
  });
});

