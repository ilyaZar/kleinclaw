// Cases recovered from the standalone miniclaw 0.1.0 test suite.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AdUpdateStrategy } from "../dist/model/ad-model.js";
import { updateAdConfigAfterPublish } from "../dist/publish-form/publish-form-metadata.js";

function publishedAd(overrides = {}) {
  return {
    createdOn: null,
    id: null,
    priceReductionCount: 0,
    repostCount: 0,
    ...overrides,
  };
}

describe("miniclaw publish metadata", () => {
  it("records ID, hash, and both timestamps on a first publish", () => {
    const adConfig = { title: "a valid ad title" };

    updateAdConfigAfterPublish(
      adConfig,
      publishedAd(),
      123,
      AdUpdateStrategy.Replace,
      new Date("2026-06-11T12:34:56.789Z"),
    );

    assert.equal(adConfig.id, 123);
    assert.match(adConfig.content_hash, /^[0-9a-f]{64}$/);
    assert.equal(adConfig.updated_on, "2026-06-11T12:34:56+00:00");
    assert.equal(adConfig.created_on, "2026-06-11T12:34:56+00:00");
    assert.equal(adConfig.repost_count, 1);
    assert.equal("price_reduction_count" in adConfig, false);
  });

  it("increments the repost count on a republish", () => {
    const adConfig = {
      created_on: "2026-06-01T08:00:00+00:00",
      repost_count: 3,
      title: "a valid ad title",
    };

    updateAdConfigAfterPublish(
      adConfig,
      publishedAd({ createdOn: new Date("2026-06-01T08:00:00Z"), id: 99 }),
      124,
      AdUpdateStrategy.Replace,
      new Date("2026-06-11T12:00:00Z"),
    );

    assert.equal(adConfig.id, 124);
    assert.equal(adConfig.repost_count, 4);
    assert.equal(adConfig.created_on, "2026-06-01T08:00:00+00:00");
  });

  it("keeps the repost count and creation date when modifying", () => {
    const adConfig = {
      created_on: "2026-06-10T12:00:00+00:00",
      repost_count: 8,
      title: "a valid ad title",
    };

    updateAdConfigAfterPublish(
      adConfig,
      publishedAd({
        createdOn: new Date("2026-06-10T12:00:00Z"),
        id: 123,
        priceReductionCount: 2,
        repostCount: 8,
      }),
      123,
      AdUpdateStrategy.Modify,
      new Date("2026-06-11T12:34:56Z"),
    );

    assert.equal(adConfig.repost_count, 8);
    assert.equal(adConfig.price_reduction_count, 2);
    assert.equal(adConfig.updated_on, "2026-06-11T12:34:56+00:00");
    assert.equal(adConfig.created_on, "2026-06-10T12:00:00+00:00");
  });
});
