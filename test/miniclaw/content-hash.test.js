import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contentHashForAd } from "../../miniclaw/dist/model/content-hash.js";

describe("miniclaw content hashes", () => {
  it("ignores metadata while hashing user-visible listing content", () => {
    const base = {
      id: 101,
      title: "Kompaktlautsprecher",
      description: "Guter Zustand",
      price: 25,
      shipping_costs: "4.50",
      auto_price_reduction: {
        enabled: true,
        strategy: "FIXED",
        amount: "2",
        min_price: "15",
        delay_reposts: 1,
        delay_days: 0,
        on_update: true,
      },
      created_on: "2026-01-01T00:00:00Z",
      updated_on: "2026-01-02T00:00:00Z",
      content_hash: "old",
      repost_count: 7,
      price_reduction_count: 2,
    };

    const sameContent = {
      ...base,
      id: 999,
      shipping_costs: 4.5,
      created_on: "2027-01-01T00:00:00Z",
      updated_on: "2027-01-02T00:00:00Z",
      content_hash: "new",
      repost_count: 0,
      price_reduction_count: 0,
    };
    const changedContent = {
      ...sameContent,
      description: "Guter Zustand mit Kabel",
    };

    assert.equal(contentHashForAd(base), contentHashForAd(sameContent));
    assert.notEqual(contentHashForAd(base), contentHashForAd(changedContent));
  });
});
