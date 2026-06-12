import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { setSpecialAttributes } from "../miniclaw/dist/publish-form.js";
import { By, TimeoutError } from "../miniclaw/dist/web-primitives.js";

function buttonComboboxElement(id) {
  return {
    attrs: {
      id,
      name: `attributeMap[${id}]`,
      role: "combobox",
      type: "button",
    },
    localName: "button",
  };
}

describe("miniclaw special attributes", () => {
  it("selects button combobox attributes by api value through React option data", async () => {
    const calls = [];
    const buttonId = "wohnzimmer.art_s";
    const controller = {
      async webClick(type, value) {
        calls.push(["click", type, value]);
      },
      async webExecute(script) {
        calls.push(["execute", script]);
        assert.match(script, /__reactFiber/);
        assert.match(script, /optionsData\[j\]\.value === "weinregale"/);
        return true;
      },
      async webFind(type, value) {
        calls.push(["find", type, value]);
        assert.equal(type, By.ID);
        assert.equal(value, `${buttonId}-menu`);
        return {};
      },
      async webFindAll() {
        return [buttonComboboxElement(buttonId)];
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
      async webSelectButtonCombobox() {
        throw new Error("display-text combobox helper should not be called");
      },
      async webSelectCombobox() {
        throw new Error("webSelectCombobox should not be called");
      },
    };

    await setSpecialAttributes(controller, {
      "wohnzimmer.art_s": "weinregale",
    });

    assert.deepEqual(calls[0], ["click", By.ID, buttonId]);
    assert.equal(calls.at(-1)?.[0], "execute");
  });

  it("wraps failed api-value button combobox selection as an attribute timeout", async () => {
    const buttonId = "wohnzimmer.art_s";
    const controller = {
      async webClick() {},
      async webExecute() {
        return false;
      },
      async webFind() {
        return {};
      },
      async webFindAll() {
        return [buttonComboboxElement(buttonId)];
      },
      async webInput() {},
      async webProbe() {
        return null;
      },
      async webSelect() {},
      async webSelectButtonCombobox() {},
      async webSelectCombobox() {},
    };

    await assert.rejects(
      () => setSpecialAttributes(controller, {
        "wohnzimmer.art_s": "weinregale",
      }),
      (error) =>
        error instanceof TimeoutError &&
        error.message === "Failed to set attribute 'wohnzimmer.art_s'",
    );
  });
});
