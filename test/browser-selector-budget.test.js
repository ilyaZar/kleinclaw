import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocateSelectorGroupBudgets,
} from "../dist/browser/browser-selector-budget.js";

describe("miniclaw browser selector budgets", () => {
  it("allocates selector timeout budgets toward the primary selector", () => {
    assert.deepEqual(allocateSelectorGroupBudgets(10, 3), [8.5, 0.75, 0.75]);
    assert.deepEqual(
      allocateSelectorGroupBudgets(0.3, 3).map((value) => Number(value.toFixed(2))),
      [0.1, 0.1, 0.1],
    );
    assert.deepEqual(allocateSelectorGroupBudgets(-1, 1), [0]);
    assert.throws(() => allocateSelectorGroupBudgets(1, 0), /selector_count/);
  });
});
