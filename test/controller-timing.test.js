import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TimeoutError,
  WebController,
} from "../dist/web-primitives.js";
import {
  makeClock,
} from "../test-support/controller-clock-fixture.js";

describe("miniclaw controller timing", () => {
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
});
