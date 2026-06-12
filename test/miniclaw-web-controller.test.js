import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TimeoutConfig } from "../miniclaw/dist/model/timeout-config.js";
import {
  By,
  Is,
  TimeoutError,
  WebController,
} from "../miniclaw/dist/web-primitives.js";

function makeClock() {
  let now = 0;
  const sleeps = [];
  return {
    sleeps,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms / 1000;
    },
  };
}

describe("miniclaw web controller waits", () => {
  it("matches Python by rejecting ID multi-lookups", async () => {
    const controller = new WebController({
      locator() {
        throw new Error("locator should not be called");
      },
    });

    await assert.rejects(
      () => controller.webFindAll(By.ID, "single-id", { timeout: 0.1 }),
      {
        name: "AssertionError",
        message: "Unsupported selector type: ID",
      },
    );
  });

  it("uses selector-specific timeout messages for failed single lookups", async () => {
    const controller = new WebController({
      locator(selector) {
        assert.equal(selector, "#missing-id");
        return {
          first() {
            return this;
          },
          async waitFor() {
            throw new TimeoutError("generic locator timeout");
          },
        };
      },
    });

    await assert.rejects(
      () => controller.webFind(By.ID, "missing-id", { timeout: 0.2 }),
      (error) =>
        error instanceof TimeoutError &&
        error.message ===
          "No HTML element found with ID 'missing-id' within 0.2 seconds.",
    );
  });

  it("uses selector-specific timeout messages for failed multi-lookups", async () => {
    const controller = new WebController({
      locator(selector) {
        assert.equal(selector, ".missing-class");
        return {
          async waitFor() {
            throw new TimeoutError("generic locator timeout");
          },
        };
      },
    });

    await assert.rejects(
      () => controller.webFindAll(By.CLASS_NAME, "missing-class", {
        timeout: 0.3,
      }),
      (error) =>
        error instanceof TimeoutError &&
        error.message ===
          "No HTML elements found with CSS class 'missing-class' within 0.3 seconds.",
    );
  });

  it("polls webAwait until the condition returns a truthy result", async () => {
    const clock = makeClock();
    let calls = 0;
    const controller = new WebController({}, {
      sleep: clock.sleep,
      timeSource: clock.now,
    });

    const result = await controller.webAwait(() => {
      calls += 1;
      return calls === 3 ? "ready" : "";
    }, {
      applyMultiplier: false,
      timeout: 2,
    });

    assert.equal(result, "ready");
    assert.equal(calls, 3);
    assert.deepEqual(clock.sleeps, [500, 500]);
  });

  it("raises the current condition error when webAwait times out on an exception", async () => {
    const clock = makeClock();
    let calls = 0;
    const failure = new Error("current condition failed");
    const controller = new WebController({}, {
      sleep: clock.sleep,
      timeSource: clock.now,
    });

    await assert.rejects(
      () => controller.webAwait(() => {
        calls += 1;
        if (calls === 1) {
          return false;
        }
        throw failure;
      }, {
        applyMultiplier: false,
        timeout: 0.4,
      }),
      failure,
    );
    assert.equal(calls, 2);
    assert.deepEqual(clock.sleeps, [400]);
  });

  it("raises the configured TimeoutError message when webAwait remains false", async () => {
    const clock = makeClock();
    const controller = new WebController({}, {
      sleep: clock.sleep,
      timeSource: clock.now,
    });

    await assert.rejects(
      () => controller.webAwait(() => false, {
        applyMultiplier: false,
        timeout: 0.3,
        timeoutErrorMessage: "custom timeout",
      }),
      (error) =>
        error instanceof TimeoutError &&
        error.message === "custom timeout",
    );
    assert.deepEqual(clock.sleeps, [300]);
  });

  it("uses page-load effective timeout once when opening pages", async () => {
    const clock = makeClock();
    const events = [];
    const readyStates = [false, false, true];
    const page = {
      url: "about:blank",
      async evaluate(script) {
        events.push(`evaluate:${script}`);
        if (script === "document.readyState == 'complete'") {
          return readyStates.shift() ?? true;
        }
        return undefined;
      },
      async goto(url, options) {
        events.push(`goto:${url}:${options.timeout}`);
        assert.equal(Object.hasOwn(options, "waitUntil"), false);
      },
      async waitForLoadState() {
        events.push("waitForLoadState");
      },
    };
    const controller = new WebController(page, {
      sleep: clock.sleep,
      timeSource: clock.now,
      timeoutConfig: new TimeoutConfig({
        multiplier: 2,
        retry_enabled: false,
      }),
    });

    await controller.webOpen("https://www.kleinanzeigen.de/p-test", {
      timeout: 4,
    });

    assert.deepEqual(events, [
      "goto:https://www.kleinanzeigen.de/p-test:8000",
      "evaluate:document.readyState == 'complete'",
      "evaluate:document.readyState == 'complete'",
      "evaluate:document.readyState == 'complete'",
    ]);
    assert.deepEqual(clock.sleeps, [500, 500]);
  });

  it("runs webRequest through page-context fetch with Python response shape", async () => {
    const evaluateArgs = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/delete");
      assert.deepEqual(options, {
        headers: { "x-csrf-token": "token" },
        method: "POST",
        redirect: "follow",
      });
      return {
        status: 202,
        statusText: "Accepted",
        headers: {
          forEach(callback) {
            callback("application/json", "content-type");
            callback("trace-1", "x-trace-id");
          },
        },
        text: async () => "{\"ok\":true}",
      };
    };
    const controller = new WebController({
      async evaluate(pageFunction, arg) {
        evaluateArgs.push(arg);
        return await pageFunction(arg);
      },
    });

    try {
      const response = await controller.webRequest(
        "/api/delete",
        "post",
        [202],
        { "x-csrf-token": "token" },
      );

      assert.deepEqual(evaluateArgs, [{
        requestHeaders: { "x-csrf-token": "token" },
        requestMethod: "POST",
        requestUrl: "/api/delete",
      }]);
      assert.deepEqual(response, {
        content: "{\"ok\":true}",
        headers: {
          "content-type": "application/json",
          "x-trace-id": "trace-1",
        },
        statusCode: 202,
        statusMessage: "Accepted",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

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

    assert.equal(await controller.webCheck(By.ID, "checkbox", Is.SELECTED), true);
    assert.equal(await controller.webCheck(By.ID, "custom", Is.SELECTED), false);
    assert.equal(await controller.webCheck(By.ID, "radio", Is.SELECTED), false);
  });

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
