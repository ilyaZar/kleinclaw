import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CATEGORY_PICKER_RADIO_SELECTOR,
  IMAGE_FILE_INPUT_SELECTOR,
  IMAGE_MARKER_SELECTOR,
  IMAGE_REMOVE_BUTTON_SELECTOR,
  SHIPPING_DIALOG_DONE_BUTTON_XPATH,
  SHIPPING_DIALOG_NEXT_BUTTON_XPATH,
  SHIPPING_DIALOG_XPATH,
} from "../miniclaw/dist/publish-form/constants.js";
import {
  resolveCategorySuggestions,
} from "../miniclaw/dist/publish-form/category-selection.js";
import {
  cityListboxOptionSelector,
  locationMatchesTarget,
  selectCityComboboxOption,
  setContactLocation,
} from "../miniclaw/dist/publish-form/contact-fields.js";
import {
  configurePriceFields,
  configureSellDirectly,
  publishingDescription,
  selectWantedShipping,
} from "../miniclaw/dist/publish-form/core-fields.js";
import {
  cleanupExistingImages,
  uploadImages,
} from "../miniclaw/dist/publish-form/image-upload.js";
import {
  setShippingOptions,
  shippingCostInputValue,
  shippingOptionCarrierCodes,
} from "../miniclaw/dist/publish-form/shipping-fields.js";
import {
  By,
  Is,
  TimeoutError,
} from "../miniclaw/dist/web-primitives.js";

function key(type, value) {
  return `${type}:${value}`;
}

function shippingDialogInputXPath(type, value) {
  return `${SHIPPING_DIALOG_XPATH}//input[@type="${type}" and @value='${value}']`;
}

function fakeElement({
  attrs = {},
  text = "",
  value = "",
  localName = "input",
  onClick,
  onSendFile,
} = {}) {
  return {
    attrs,
    localName,
    value,
    async click() {
      onClick?.();
    },
    async getAttribute(name) {
      return attrs[name] ?? null;
    },
    async inputValue() {
      return value;
    },
    async sendFile(file) {
      onSendFile?.(file);
    },
    async setInputFiles(file) {
      onSendFile?.(file);
    },
    async textContent() {
      return text;
    },
  };
}

function createController({
  elements = {},
  lists = {},
  probes = {},
  checks = {},
  execute,
} = {}) {
  const calls = [];
  return {
    calls,
    async webCheck(type, value, state) {
      calls.push(["check", type, value, state]);
      return Boolean(checks[key(type, `${value}:${state}`)]);
    },
    async webClick(type, value, timeout) {
      calls.push(["click", type, value, timeout]);
    },
    async webExecute(script) {
      calls.push(["execute", script]);
      return execute?.(script);
    },
    async webFind(type, value) {
      calls.push(["find", type, value]);
      const element = elements[key(type, value)];
      if (!element) {
        throw new TimeoutError(`missing ${type}:${value}`);
      }
      return element;
    },
    async webFindAll(type, value) {
      calls.push(["findAll", type, value]);
      const result = lists[key(type, value)];
      if (!result) {
        throw new TimeoutError(`missing list ${type}:${value}`);
      }
      return typeof result === "function" ? result() : result;
    },
    async webInput(type, value, text) {
      calls.push(["input", type, value, text]);
    },
    async webProbe(type, value) {
      calls.push(["probe", type, value]);
      return probes[key(type, value)] ?? null;
    },
    async webSelectButtonCombobox(id, displayText, timeout) {
      calls.push(["selectButtonCombobox", id, displayText, timeout]);
    },
    async webSleep(min, max) {
      calls.push(["sleep", min, max]);
    },
  };
}

describe("miniclaw publish-form shipping", () => {
  it("maps public shipping option names to carrier codes", () => {
    assert.equal(shippingCostInputValue(4.5), "4,5");
    assert.deepEqual(
      shippingOptionCarrierCodes(["DHL_5", "Hermes_M", "DHL_5"]),
      ["DHL_002", "HERMES_003"],
    );
    assert.throws(
      () => shippingOptionCarrierCodes(["DHL_5", "unknown"]),
      /Unknown shipping option/,
    );
  });

  it("selects one package size and reconciles carrier checkboxes", async () => {
    const sizeRadio = fakeElement();
    const hermesCheckbox = fakeElement({ attrs: { checked: "" } });
    const dhlCheckbox = fakeElement();
    const elements = {
      [key(By.XPATH, shippingDialogInputXPath("radio", "MEDIUM"))]: sizeRadio,
      [key(By.XPATH, shippingDialogInputXPath("checkbox", "HERMES_003"))]:
        hermesCheckbox,
      [key(By.XPATH, shippingDialogInputXPath("checkbox", "DHL_002"))]:
        dhlCheckbox,
    };
    const controller = createController({ elements });

    await setShippingOptions(controller, {
      shippingOptions: ["DHL_5"],
    });

    const clicks = controller.calls
      .filter(([name]) => name === "click")
      .map(([, type, value]) => [type, value]);
    assert.deepEqual(clicks, [
      [By.XPATH, shippingDialogInputXPath("radio", "MEDIUM")],
      [By.XPATH, SHIPPING_DIALOG_NEXT_BUTTON_XPATH],
      [By.XPATH, shippingDialogInputXPath("checkbox", "HERMES_003")],
      [By.XPATH, shippingDialogInputXPath("checkbox", "DHL_002")],
      [By.XPATH, SHIPPING_DIALOG_DONE_BUTTON_XPATH],
    ]);
  });

  it("rejects mixed package sizes before changing dialog state", async () => {
    await assert.rejects(
      () => setShippingOptions(createController(), {
        shippingOptions: ["DHL_2", "Hermes_M"],
      }),
      /one package size/,
    );
  });
});

describe("miniclaw publish-form contact location", () => {
  it("matches city suggestions without requiring exact suffix text", () => {
    assert.equal(locationMatchesTarget("Berlin", "Berlin - Mitte"), true);
    assert.equal(locationMatchesTarget("Mitte", "Berlin - Mitte"), true);
    assert.equal(locationMatchesTarget("Berlin - Mitte", "Berlin - Mitte"), true);
    assert.equal(locationMatchesTarget("Berlin - Mitte", "Berlin - Neukolln"), false);
    assert.match(cityListboxOptionSelector('city"list'), /\[id="city\\"list"\]/);
  });

  it("raises an explicit ambiguity error for duplicate city suffixes", async () => {
    const city = fakeElement({
      attrs: { "aria-controls": "city-list" },
      localName: "button",
    });
    const controller = createController({
      elements: {
        [key(By.ID, "ad-city")]: city,
      },
      lists: {
        [key(By.CSS_SELECTOR, cityListboxOptionSelector("city-list"))]: [
          fakeElement({ text: "Berlin - Mitte" }),
          fakeElement({ text: "Hamburg - Mitte" }),
        ],
      },
    });

    await assert.rejects(
      () => selectCityComboboxOption(controller, "Mitte"),
      /Ambiguous contact location 'Mitte'/,
    );
  });

  it("does nothing when the current city already matches the target", async () => {
    const controller = createController({
      elements: {
        [key(By.ID, "ad-city")]: fakeElement({
          localName: "input",
          value: "Berlin - Mitte",
        }),
      },
    });

    await setContactLocation(controller, "Mitte");

    assert.deepEqual(
      controller.calls.map(([name, type, value]) => [name, type, value]),
      [["find", By.ID, "ad-city"]],
    );
  });
});

describe("miniclaw publish-form core fields", () => {
  it("builds the publish description users will see", () => {
    assert.equal(
      publishingDescription({
        descriptionPrefix: "Prefix ",
        description: "seller@example.invalid",
        descriptionSuffix: " suffix",
      }),
      "Prefix seller(at)example.invalid suffix",
    );
    assert.throws(
      () => publishingDescription({
        descriptionPrefix: "",
        description: "x".repeat(4001),
        descriptionSuffix: "",
      }),
      /exceeds 4000 chars/,
    );
  });

  it("selects price type and writes the visible price amount", async () => {
    const controller = createController({
      elements: {
        [key(By.ID, "ad-price-amount")]: fakeElement(),
      },
    });

    await configurePriceFields(controller, {
      price: 25,
      priceType: "FIXED",
    });

    const leadingCalls = controller.calls
      .slice(0, 3)
      .map(([name, type, value]) => [name, type, value]);
    assert.deepEqual(leadingCalls, [
      ["click", By.ID, "ad-price-type"],
      ["click", By.ID, "ad-price-type-menu-option-0"],
      ["find", By.ID, "ad-price-amount"],
    ]);
    assert.equal(controller.calls[3][0], "execute");
    assert.match(controller.calls[3][1], /"ad-price-amount","25"/);
  });

  it("fails clearly when direct-buy controls are unavailable", async () => {
    await assert.rejects(
      () => configureSellDirectly(createController(), {
        type: "OFFER",
        priceType: "FIXED",
        sellDirectly: true,
        shippingType: "SHIPPING",
      }),
      /required control is not available/,
    );
  });

  it("selects wanted-ad shipping through the button combobox", async () => {
    const controller = createController({
      elements: {
        [key(By.CSS_SELECTOR, '[role="combobox"][id$=".versand"]')]:
          fakeElement({ attrs: { id: "wanted.versand" } }),
      },
    });

    assert.equal(await selectWantedShipping(controller, "PICKUP"), true);
    assert.deepEqual(
      controller.calls.find(([name]) => name === "selectButtonCombobox"),
      ["selectButtonCombobox", "wanted.versand", "Nur Abholung", undefined],
    );
  });
});

describe("miniclaw publish-form images", () => {
  it("uploads all requested files and waits for processed markers", async () => {
    const sentFiles = [];
    const existingMarker = fakeElement({ attrs: { value: "old" } });
    const uploadedA = fakeElement({ attrs: { value: "new-a" } });
    const uploadedB = fakeElement({ attrs: { value: "new-b" } });
    const controller = createController({
      elements: {
        [key(By.CSS_SELECTOR, IMAGE_FILE_INPUT_SELECTOR)]:
          fakeElement({ onSendFile: (file) => sentFiles.push(file) }),
      },
      lists: {
        [key(By.CSS_SELECTOR, IMAGE_MARKER_SELECTOR)]: () => [
          existingMarker,
          ...(sentFiles.length > 0 ? [uploadedA] : []),
          ...(sentFiles.length > 1 ? [uploadedB] : []),
        ],
      },
    });
    let waited = false;

    await uploadImages(controller, {
      images: ["/tmp/a.jpg", "/tmp/b.jpg"],
    }, {
      waitForImageUpload: async (condition) => {
        waited = true;
        assert.equal(await condition(), true);
      },
    });

    assert.deepEqual(sentFiles, ["/tmp/a.jpg", "/tmp/b.jpg"]);
    assert.equal(waited, true);
  });

  it("removes existing image markers before replacement uploads", async () => {
    let removed = 0;
    const controller = createController({
      lists: {
        [key(By.CSS_SELECTOR, IMAGE_MARKER_SELECTOR)]: [
          fakeElement({ attrs: { value: "old-a" } }),
          fakeElement({ attrs: { value: "old-b" } }),
        ],
      },
      probes: {
        [key(By.CSS_SELECTOR, IMAGE_REMOVE_BUTTON_SELECTOR)]:
          fakeElement({ onClick: () => { removed += 1; } }),
      },
    });

    assert.equal(await cleanupExistingImages(controller), 2);
    assert.equal(removed, 2);
  });
});

describe("miniclaw publish-form category suggestions", () => {
  it("selects the deepest matching suggested category segment", async () => {
    const controller = createController({
      probes: {
        [key(By.ID, "ad-category-picker")]: fakeElement(),
      },
      lists: {
        [key(By.CSS_SELECTOR, CATEGORY_PICKER_RADIO_SELECTOR)]: [
          fakeElement({ attrs: { value: "Audio", id: "radio-audio" } }),
          fakeElement({ attrs: { value: "Elektronik", id: "radio-electronics" } }),
        ],
      },
    });

    assert.equal(
      await resolveCategorySuggestions(controller, "Elektronik / Audio"),
      true,
    );
    assert.deepEqual(
      controller.calls.find(([name]) => name === "click"),
      [
        "click",
        By.XPATH,
        "//fieldset[@id='ad-category-picker']//label[@for='radio-audio']",
        undefined,
      ],
    );
  });

  it("explains offered suggestions when configured category cannot be matched", async () => {
    const controller = createController({
      probes: {
        [key(By.ID, "ad-category-picker")]: fakeElement(),
      },
      lists: {
        [key(By.CSS_SELECTOR, CATEGORY_PICKER_RADIO_SELECTOR)]: [
          fakeElement({ attrs: { value: "Fahrrader", id: "radio-bike" } }),
        ],
      },
    });

    await assert.rejects(
      () => resolveCategorySuggestions(controller, "Elektronik / Audio"),
      /offered suggestions \[Fahrrader\]/,
    );
  });
});
