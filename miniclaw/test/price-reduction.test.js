import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AdUpdateStrategy,
  applyAutoPriceReduction,
  calculateAutoPriceWithTrace,
  evaluateAutoPriceReduction,
} from "../dist/model/price-reduction.js";

describe("miniclaw price reduction", () => {
  const percentageReduction = {
    enabled: true,
    strategy: "PERCENTAGE",
    amount: 12.5,
    minPrice: 70,
    delayReposts: 0,
    delayDays: 0,
    onUpdate: false,
  };

  it("rounds percentage reductions and applies the configured floor", () => {
    const trace = calculateAutoPriceWithTrace({
      basePrice: 100,
      autoPriceReduction: percentageReduction,
      targetReductionCycle: 3,
    });

    assert.equal(trace.price, 70);
    assert.equal(trace.floor?.toNumber(), 70);
    assert.deepEqual(
      trace.steps.map((step) => ({
        cycle: step.cycle,
        before: step.priceBefore.toNumber(),
        reduction: step.reductionValue.toNumber(),
        after: step.priceAfterRounding.toNumber(),
        floorApplied: step.floorApplied,
      })),
      [
        { cycle: 1, before: 100, reduction: 12.5, after: 88, floorApplied: false },
        { cycle: 2, before: 88, reduction: 11, after: 77, floorApplied: false },
        { cycle: 3, before: 77, reduction: 9.625, after: 70, floorApplied: true },
      ],
    );
  });

  it("keeps publish reductions behind repost and day delays", () => {
    const ad = {
      price: 100,
      repostCount: 3,
      priceReductionCount: 0,
      updatedOn: "2026-01-01T00:00:00Z",
      autoPriceReduction: {
        enabled: true,
        strategy: "FIXED",
        amount: 10,
        minPrice: 50,
        delayReposts: 2,
        delayDays: 3,
        onUpdate: true,
      },
    };

    const tooEarly = evaluateAutoPriceReduction(ad, {
      mode: AdUpdateStrategy.Replace,
      now: new Date("2026-01-02T00:00:00Z"),
    });
    assert.equal(tooEarly.reason, "day_delay_waiting");
    assert.equal(tooEarly.resultPrice, 100);
    assert.equal(tooEarly.elapsedDays, 1);

    const ready = applyAutoPriceReduction(ad, {
      mode: AdUpdateStrategy.Replace,
      now: new Date("2026-01-05T00:00:00Z"),
    });
    assert.equal(ready.reason, "eligible");
    assert.equal(ready.resultPrice, 90);
    assert.equal(ready.nextCycle, 1);
    assert.equal(ad.price, 90);
    assert.equal(ad.priceReductionCount, 1);
    assert.equal(ad.price_reduction_count, 1);
  });

  it("does not let update mode reduce prices unless on-update is enabled", () => {
    const disabled = evaluateAutoPriceReduction({
      price: 100,
      repostCount: 99,
      autoPriceReduction: {
        enabled: true,
        strategy: "FIXED",
        amount: 10,
        minPrice: 20,
        delayReposts: 99,
        delayDays: 0,
        onUpdate: false,
      },
    }, { mode: AdUpdateStrategy.Modify });

    assert.equal(disabled.reason, "update_disabled");
    assert.equal(disabled.resultPrice, 100);

    const enabled = evaluateAutoPriceReduction({
      price: 100,
      repostCount: 1,
      autoPriceReduction: {
        enabled: true,
        strategy: "FIXED",
        amount: 10,
        minPrice: 20,
        delayReposts: 99,
        delayDays: 0,
        onUpdate: true,
      },
    }, { mode: AdUpdateStrategy.Modify });

    assert.equal(enabled.reason, "eligible");
    assert.equal(enabled.delayRepostsIgnored, true);
    assert.equal(enabled.resultPrice, 90);
  });
});
