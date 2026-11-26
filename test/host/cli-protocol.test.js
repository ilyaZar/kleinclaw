import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMiniclawResult } from "../../dist/miniclaw-protocol.js";

describe("miniclaw protocol", () => {
  it("fails closed on malformed or contradictory results", () => {
    const transport = { exitCode: 0, timedOut: false };
    const valid = JSON.stringify({
      schemaVersion: 1,
      command: "publish",
      status: "succeeded",
      counts: { changed: 1, failed: 0, total: 1 },
    });

    assert.equal(parseMiniclawResult(valid, "publish", transport).ok, true);
    for (const output of [
      "",
      "{}",
      `${valid}\nnoise`,
      valid.replace('"schemaVersion":1', '"schemaVersion":2'),
      valid.replace('"command":"publish"', '"command":"delete"'),
    ]) {
      assert.equal(parseMiniclawResult(output, "publish", transport).ok, false);
    }
    assert.equal(
      parseMiniclawResult(valid, "publish", {
        exitCode: 1,
        timedOut: false,
      }).ok,
      false,
    );
    assert.equal(
      parseMiniclawResult(
        valid.replace(
          '"counts":{"changed":1,"failed":0,"total":1}',
          '"counts":{"changed":0,"failed":1,"total":1}',
        ),
        "publish",
        transport,
      ).ok,
      false,
    );
    assert.equal(
      parseMiniclawResult(
        valid.replace('"status":"succeeded"', '"status":"partial_failure"')
          .replace(',"counts":{"changed":1,"failed":0,"total":1}', ""),
        "publish",
        transport,
      ).ok,
      false,
    );
    assert.equal(
      parseMiniclawResult(
        valid.replace('"status":"succeeded"', '"status":"failed"')
          .replace(
            '"counts":{"changed":1,"failed":0,"total":1}',
            '"counts":{"changed":0,"failed":1,"total":1}',
          ),
        "publish",
        transport,
      ).ok,
      true,
    );
  });
});
