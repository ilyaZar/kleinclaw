import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  openShippingSizeSelection,
  setShipping,
} from "../dist/publish-form/publish-form-shipping-fields.js";
import { By, TimeoutError } from "../dist/web-primitives.js";

const SIZE_RADIO = (size) =>
  `//*[self::dialog or @role="dialog"]//input[@type="radio" and @value='${size}']`;
const OTHER_METHODS = "//*[normalize-space(text())='Andere Versandmethoden']";
const BACK = "//*[normalize-space(text())='Zurück']";

// A shipping dialog whose visible state changes as elements are clicked.
function dialogController({ panes, start = 0, versand = null, fieldset = false, pickup = true }) {
  const events = [];
  let pane = start;
  const element = (name, onClick) => ({
    async click() {
      events.push(`click:${name}`);
      onClick?.();
    },
    attrs: { id: name },
  });
  const controller = {
    async webCheck() {
      return false;
    },
    async webClick(type, value) {
      events.push(`click:${value}`);
    },
    async webFind() {
      throw new TimeoutError("not expected");
    },
    async webProbe(type, value) {
      const current = panes[pane] ?? {};
      if (type === By.CSS_SELECTOR) {
        return versand && value === versand ? element("versand") : null;
      }
      if (type === By.ID) {
        if (value === "ad-shipping-enabled-no") return pickup ? element(value) : null;
        if (value === "ad-shipping-enabled") return fieldset ? element(value) : null;
        return null;
      }
      if (value === OTHER_METHODS && current.other !== undefined) {
        return element("other", () => {
          pane = current.other;
        });
      }
      if (value === BACK && current.back !== undefined) {
        return element("back", () => {
          pane = current.back;
        });
      }
      if (current.sizes && value === SIZE_RADIO("MEDIUM")) {
        return element("size");
      }
      return null;
    },
    async webSelectButtonCombobox(id, value) {
      events.push(`combobox:${id}:${value}`);
    },
    async webSleep() {},
  };
  return { controller, events };
}

describe("miniclaw shipping dialog routes", () => {
  it("accepts a dialog that opens directly on the package sizes", async () => {
    const { controller, events } = dialogController({ panes: [{ sizes: true }] });
    await openShippingSizeSelection(controller);
    assert.deepEqual(events, []);
  });

  it("opens 'Andere Versandmethoden' when it is not a button", async () => {
    const { controller, events } = dialogController({ panes: [{ other: 1 }, { sizes: true }] });
    await openShippingSizeSelection(controller);
    assert.deepEqual(events, ["click:other"]);
  });

  it("steps back out of a nested carrier pane at most twice", async () => {
    const nested = dialogController({ panes: [{ back: 1 }, { back: 2 }, { sizes: true }] });
    await openShippingSizeSelection(nested.controller);
    assert.deepEqual(nested.events, ["click:back", "click:back"]);

    const tooDeep = dialogController({ panes: [{ back: 1 }, { back: 2 }, { back: 3 }, { sizes: true }] });
    await assert.rejects(openShippingSizeSelection(tooDeep.controller), /Failed to configure shipping/);
  });
});

describe("miniclaw shipping types", () => {
  it("rejects individual shipping costs without predefined options", async () => {
    const { controller, events } = dialogController({ panes: [] });
    await assert.rejects(
      setShipping(controller, { shippingCosts: 4.5, shippingOptions: [], shippingType: "SHIPPING" }),
      /Individual shipping \(shipping_costs\) is no longer supported/,
    );
    assert.equal(events.includes("click:ad-shipping-options"), false);
  });

  it("selects shipping through the PRO 'Versand' combobox", async () => {
    const { controller, events } = dialogController({
      panes: [],
      versand: 'button[role="combobox"][id="versand"]',
    });
    await setShipping(controller, { shippingOptions: ["DHL_5"], shippingType: "SHIPPING" });
    assert.deepEqual(events, ["combobox:versand:Versand möglich"]);
  });

  it("treats a rendered fieldset without the pickup radio as not loaded", async () => {
    const { controller } = dialogController({ fieldset: true, panes: [], pickup: false });
    await assert.rejects(
      setShipping(controller, { shippingType: "PICKUP" }),
      /pickup radio is missing/,
    );
  });
});
