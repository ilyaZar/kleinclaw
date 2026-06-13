import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applyAfterDeletePolicy,
  runDeleteAdsBatch,
} from "../miniclaw/dist/delete-orchestration.js";
import {
  runPublishAdsBatch,
  runUpdateAdsBatch,
} from "../miniclaw/dist/publish-orchestration.js";
import {
  allocateSelectorGroupBudgets,
} from "../miniclaw/dist/browser/selector-budget.js";
import {
  convertRemoteObjectValue,
  normalizeRemoteObjectResult,
} from "../miniclaw/dist/browser/remote-object.js";
import {
  TIMING_FILE,
  TimingCollector,
} from "../miniclaw/dist/timing-collector.js";
import { TimeoutError } from "../miniclaw/dist/web-primitives.js";

let adCounter = 0;

function loadedAd(overrides = {}) {
  const id = overrides.id ?? 123;
  const title = overrides.title ?? `orchestration ad ${++adCounter}`;
  const raw = {
    active: true,
    content_hash: "old",
    created_on: "2026-01-01T00:00:00",
    id,
    price_reduction_count: 2,
    repost_count: 3,
    title,
    updated_on: "2026-01-02T00:00:00",
    ...overrides.raw,
  };
  const ad = {
    active: true,
    contentHash: "old",
    createdOn: new Date("2026-01-01T00:00:00Z"),
    id,
    price: 20,
    priceReductionCount: 2,
    repostCount: 3,
    title,
    updatedOn: new Date("2026-01-02T00:00:00Z"),
    ...overrides.ad,
  };
  return {
    ad,
    filePath: `/tmp/${title}.yaml`,
    raw,
    relativePath: `ads/${title}.yaml`,
  };
}

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

describe("miniclaw delete orchestration", () => {
  it("resets local metadata after a confirmed delete", async () => {
    const ad = loadedAd({ id: 55 });
    const saved = [];

    const result = await runDeleteAdsBatch([ad], {
      afterDelete: "RESET",
      deleteAd: async () => true,
      saveAdConfig: async (adFile, adConfig) => {
        saved.push({ adConfig: { ...adConfig }, adFile });
      },
    });

    assert.equal(result.deleted, 1);
    assert.equal(result.cleanupApplied, 1);
    assert.deepEqual(result.events.map((event) => event.status), [
      "deleted",
      "cleanup",
    ]);
    assert.equal(ad.ad.id, null);
    assert.equal(ad.ad.repostCount, 0);
    assert.equal("id" in ad.raw, false);
    assert.equal("content_hash" in ad.raw, false);
    assert.equal(saved.length, 1);
  });

  it("can disable a local ad without deleting metadata", () => {
    const ad = {
      active: true,
      id: 123,
    };
    const raw = {
      active: true,
      id: 123,
    };

    assert.equal(applyAfterDeletePolicy(ad, raw, "DISABLE"), true);
    assert.equal(ad.active, false);
    assert.deepEqual(raw, { active: false, id: 123 });
    assert.equal(applyAfterDeletePolicy(ad, raw, "NONE"), false);
  });
});

describe("miniclaw browser helper utilities", () => {
  it("allocates selector timeout budgets toward the primary selector", () => {
    assert.deepEqual(allocateSelectorGroupBudgets(10, 3), [8.5, 0.75, 0.75]);
    assert.deepEqual(
      allocateSelectorGroupBudgets(0.3, 3).map((value) => Number(value.toFixed(2))),
      [0.1, 0.1, 0.1],
    );
    assert.deepEqual(allocateSelectorGroupBudgets(-1, 1), [0]);
    assert.throws(() => allocateSelectorGroupBudgets(1, 0), /selector_count/);
  });

  it("normalizes Selenium-style remote object payloads", () => {
    class RemoteObjectMock {
      constructor(value) {
        this.deepSerializedValue = { value };
      }
    }

    assert.deepEqual(
      convertRemoteObjectValue([
        ["title", { type: "string", value: "Boxen" }],
        ["nested", [["price", { type: "number", value: 25 }]]],
      ]),
      {
        nested: { price: 25 },
        title: "Boxen",
      },
    );
    assert.deepEqual(
      normalizeRemoteObjectResult(new RemoteObjectMock([
        ["active", { type: "boolean", value: true }],
      ])),
      { active: true },
    );
    assert.equal(normalizeRemoteObjectResult("plain"), "plain");
  });
});

describe("miniclaw timing collector", () => {
  it("keeps recent timing sessions and drops expired or malformed records", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-timing-"));
    const timingFile = path.join(tmp, TIMING_FILE);
    await fs.writeFile(
      timingFile,
      JSON.stringify([
        {
          command: "old",
          ended_at: "2025-01-01T00:00:00.000Z",
          records: [],
          session_id: "old",
          started_at: "2025-01-01T00:00:00.000Z",
        },
        {
          command: "recent",
          ended_at: "2026-01-05T00:00:00.000Z",
          records: [],
          session_id: "recent",
          started_at: "2026-01-05T00:00:00.000Z",
        },
        { command: "malformed" },
      ]),
      "utf8",
    );

    let now = new Date("2026-01-10T00:00:00.000Z");
    const collector = new TimingCollector(tmp, "publish", {
      now: () => now,
    });
    now = new Date("2026-01-10T00:00:01.000Z");
    collector.record({
      actualDuration: 1.25,
      attemptIndex: 0,
      configuredTimeout: 5,
      description: "find submit button",
      effectiveTimeout: 5,
      key: "submit",
      operationType: "webFind",
      success: true,
    });
    now = new Date("2026-01-10T00:00:02.000Z");

    assert.equal(collector.flush(), timingFile);
    assert.equal(collector.flush(), null);

    const sessions = JSON.parse(await fs.readFile(timingFile, "utf8"));
    assert.deepEqual(sessions.map((session) => session.command), [
      "recent",
      "publish",
    ]);
    assert.deepEqual(sessions[1].records[0], {
      actual_duration_sec: 1.25,
      attempt_index: 0,
      configured_timeout_sec: 5,
      description: "find submit button",
      effective_timeout_sec: 5,
      operation_key: "submit",
      operation_type: "webFind",
      success: true,
      timestamp: "2026-01-10T00:00:01.000Z",
    });
  });
});
