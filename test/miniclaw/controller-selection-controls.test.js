import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TimeoutConfig,
} from "../../miniclaw/dist/model/timeout-config.js";
import {
  By,
  TimeoutError,
  WebController,
} from "../../miniclaw/dist/web-primitives.js";
import {
  makeClock,
} from "../../test-support/miniclaw/controller-clock-fixture.js";

describe("miniclaw controller selection controls", () => {
  it("waits for select elements to become clickable before selecting", async () => {
    const clock = makeClock();
    let visibleChecks = 0;
    const evaluateCalls = [];
    const element = {
      first() {
        return this;
      },
      async waitFor() {},
      async isDisabled() {
        return true;
      },
      async isVisible() {
        visibleChecks += 1;
        return visibleChecks >= 2;
      },
      async evaluate(script) {
        evaluateCalls.push(script);
      },
    };
    const controller = new WebController({
      locator(selector) {
        assert.equal(selector, "#ad-condition");
        return element;
      },
    }, {
      sleep: clock.sleep,
      sleepRangeMs: [0, 0],
      timeSource: clock.now,
    });

    await controller.webSelect(By.ID, "ad-condition", "new", 1);

    assert.equal(visibleChecks, 2);
    assert.equal(evaluateCalls.length, 1);
    assert.deepEqual(clock.sleeps, [500]);
  });

  it("uses quickDom while probing the combobox listbox fallback", async () => {
    const clock = makeClock();
    const waitTimeouts = [];
    const presses = [];
    const input = {
      first() {
        return this;
      },
      async waitFor(options) {
        waitTimeouts.push(["input", options.timeout]);
      },
      async getAttribute(name) {
        assert.equal(name, "aria-controls");
        return null;
      },
      async evaluate() {},
      async press(key) {
        presses.push(key);
      },
      async pressSequentially(value) {
        presses.push(`type:${value}`);
      },
      async inputValue() {
        return "rene lezard";
      },
    };
    const listbox = {
      first() {
        return this;
      },
      async waitFor(options) {
        waitTimeouts.push(["listbox", options.timeout]);
        throw new TimeoutError("listbox missing");
      },
    };
    const controller = new WebController({
      locator(selector) {
        if (selector === "#brand") {
          return input;
        }
        if (selector === '[role="listbox"]') {
          return listbox;
        }
        throw new Error(`unexpected selector: ${selector}`);
      },
    }, {
      randomInt: () => 0,
      sleep: clock.sleep,
      sleepRangeMs: [0, 0],
      timeSource: clock.now,
      timeoutConfig: new TimeoutConfig({
        default: 9,
        quickDom: 0.4,
        retryEnabled: false,
      }),
    });

    await controller.webSelectCombobox(By.ID, "brand", "rene_lezard");

    assert.deepEqual(waitTimeouts, [
      ["input", 9000],
      ["listbox", 400],
    ]);
    assert.deepEqual(presses, [
      "Backspace",
      "type:rene lezard",
      "ArrowDown",
      "Enter",
    ]);
    assert.deepEqual(clock.sleeps, [50, 300, 200]);
  });
});
