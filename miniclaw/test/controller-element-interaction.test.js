import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TimeoutConfig,
} from "../dist/model/timeout-config.js";
import {
  By,
  Is,
  TimeoutError,
  WebController,
} from "../dist/web-primitives.js";

describe("miniclaw controller element interaction", () => {
  it("raises Python-style assertion errors for unsupported webCheck attributes", async () => {
    const controller = new WebController({
      locator() {
        return {
          first() {
            return this;
          },
          async waitFor() {},
        };
      },
    });

    await assert.rejects(
      () => controller.webCheck(By.ID, "test-id", "BOGUS", 0.1),
      {
        name: "AssertionError",
        message: "Unsupported attribute: BOGUS",
      },
    );
  });

  it("matches Python selected checks for checkbox and radio inputs only", async () => {
    const elements = {
      checkbox: {
        checked: true,
        tagName: "INPUT",
        type: "checkbox",
      },
      custom: {
        checked: true,
        tagName: "DIV",
        type: "",
      },
      radio: {
        checked: false,
        tagName: "INPUT",
        type: "radio",
      },
    };
    const controller = new WebController({
      locator(selector) {
        const id = selector.slice(1);
        const element = elements[id];
        assert.ok(element, `unexpected selector: ${selector}`);
        return {
          first() {
            return this;
          },
          async waitFor() {},
          async evaluate(script) {
            return Function(
              "element",
              `return (${script})(element);`,
            )(element);
          },
        };
      },
    });

    assert.equal(
      await controller.webCheck(By.ID, "checkbox", Is.SELECTED),
      true,
    );
    assert.equal(
      await controller.webCheck(By.ID, "custom", Is.SELECTED),
      false,
    );
    assert.equal(
      await controller.webCheck(By.ID, "radio", Is.SELECTED),
      false,
    );
  });

  it("keeps selector-group probes single-attempt", async () => {
    const waitForCalls = [];
    const records = [];
    const missing = {
      first() {
        return missing;
      },
      async waitFor(options) {
        waitForCalls.push(options);
        throw new TimeoutError("missing");
      },
    };
    const controller = new WebController({
      locator() {
        return missing;
      },
    }, {
      sleepRangeMs: [0, 0],
      timeoutConfig: new TimeoutConfig({
        quick_dom: 0.2,
        retry_max_attempts: 5,
      }),
      timingCollector: {
        record(entry) {
          records.push(entry);
        },
      },
    });

    await assert.rejects(
      () => controller.webTextFirstAvailableOnce(
        [
          [By.ID, "first"],
          [By.ID, "second"],
        ],
        { key: "quickDom" },
      ),
      TimeoutError,
    );

    assert.equal(waitForCalls.length, 2);
    assert.deepEqual(records.map((entry) => ({
      attemptIndex: entry.attemptIndex,
      effectiveTimeout: entry.effectiveTimeout,
      operationType: entry.operationType,
      success: entry.success,
    })), [
      {
        attemptIndex: 0,
        effectiveTimeout: 0.2,
        operationType: "web_find_first_available",
        success: false,
      },
    ]);
  });

  it("falls back to textContent for text hidden from rendering when asked", async () => {
    const element = {
      first() {
        return this;
      },
      async evaluate() {
        return "";
      },
      async textContent() {
        return "  angemeldet als:\n user@example.test ";
      },
      async waitFor() {},
    };
    const controller = new WebController({
      locator() {
        return element;
      },
    }, { sleepRangeMs: [0, 0] });

    assert.deepEqual(
      await controller.webTextFirstAvailableOnce([[By.CLASS_NAME, "mr-medium"]], {
        fallbackToTextContent: true,
        timeout: 0.1,
      }),
      ["angemeldet als: user@example.test", 0],
    );
    assert.deepEqual(
      await controller.webTextFirstAvailableOnce([[By.CLASS_NAME, "mr-medium"]], { timeout: 0.1 }),
      ["", 0],
    );
  });
});
