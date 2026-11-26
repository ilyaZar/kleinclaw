import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadedAd } from "../../test-support/miniclaw/orchestration-ad-fixture.js";
import {
  applyAfterDeletePolicy,
  runDeleteAdsBatch,
} from "../../miniclaw/dist/delete-orchestration.js";

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
