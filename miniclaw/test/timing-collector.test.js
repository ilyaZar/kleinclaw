import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TIMING_FILE,
  TimingCollector,
} from "../dist/timing-collector.js";

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
