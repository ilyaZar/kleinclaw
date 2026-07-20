import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TimeoutConfig,
} from "../../miniclaw/dist/model/timeout-config.js";
import {
  TimeoutError,
  WebController,
} from "../../miniclaw/dist/web-primitives.js";
import {
  makeClock,
} from "../../test-support/miniclaw/controller-clock-fixture.js";

describe("miniclaw controller navigation", () => {
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
      assert.equal(options.signal instanceof AbortSignal, true);
      assert.deepEqual(options, {
        headers: { "x-csrf-token": "token" },
        method: "POST",
        redirect: "follow",
        signal: options.signal,
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
        requestTimeoutMs: 60000,
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

  it("times out page-context HTTP requests", async () => {
    const controller = new WebController({
      async evaluate() {
        return new Promise(() => {});
      },
    });

    await assert.rejects(
      () => controller.webRequest(
        "https://example.test/slow",
        "GET",
        200,
        null,
        { timeout: 0.01 },
      ),
      (error) =>
        error instanceof TimeoutError &&
        /did not finish within 0\.01 seconds/.test(error.message),
    );
  });
});
