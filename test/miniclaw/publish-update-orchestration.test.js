import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadedAd } from "../../test-support/miniclaw/orchestration-ad-fixture.js";
import {
  runPublishAdsBatch,
  runUpdateAdsBatch,
} from "../../miniclaw/dist/publish-orchestration.js";
import { TimeoutError } from "../../miniclaw/dist/web-primitives.js";

describe("miniclaw publish and update orchestration", () => {
  it("skips missing or paused update targets and updates active published ads", async () => {
    const calls = [];
    const result = await runUpdateAdsBatch([
      loadedAd({ id: 1, title: "missing" }),
      loadedAd({ id: 2, title: "paused" }),
      loadedAd({ id: 3, title: "active" }),
    ], {
      publishedAds: [
        { id: 2, state: "paused" },
        { id: 3, state: "active" },
      ],
      publishAd: async (context) => {
        calls.push({
          attempt: context.attempt,
          id: context.ad.id,
          mode: context.mode,
        });
      },
    });

    assert.equal(result.total, 3);
    assert.equal(result.attempted, 1);
    assert.equal(result.skippedMissing, 1);
    assert.equal(result.skippedPaused, 1);
    assert.equal(result.succeeded, 1);
    assert.deepEqual(result.events.map((event) => event.status), [
      "skipped-missing",
      "skipped-paused",
      "success",
    ]);
    assert.deepEqual(calls, [{ attempt: 1, id: 3, mode: "MODIFY" }]);
  });

  it("retries transient publish failures and records result-timeout evidence", async () => {
    const captured = [];
    const sleepDurations = [];
    let attempts = 0;

    const result = await runPublishAdsBatch([loadedAd({ id: 10 })], {
      captureError: async (context) => {
        captured.push({
          attempt: context.attempt,
          errorName: context.error.name,
        });
      },
      maxRetries: 2,
      publishedAds: [{ id: 10, state: "active" }],
      publishAd: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new TimeoutError("temporary publish timeout");
        }
      },
      retryDelayMs: 5,
      sleep: async (ms) => {
        sleepDurations.push(ms);
      },
      waitForPublishingResult: async () => {
        throw new TimeoutError("confirmation did not appear");
      },
    });

    assert.equal(result.attempted, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.resultTimeouts, 1);
    assert.deepEqual(result.events.map((event) => event.status), [
      "retry",
      "success",
      "result-timeout",
    ]);
    assert.deepEqual(captured, [{ attempt: 1, errorName: "TimeoutError" }]);
    assert.deepEqual(sleepDurations, [5]);
  });
});
