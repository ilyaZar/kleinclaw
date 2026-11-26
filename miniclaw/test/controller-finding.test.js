import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  By,
  TimeoutError,
  WebController,
} from "../dist/web-primitives.js";

describe("miniclaw controller finding", () => {
  it("matches Python by rejecting ID multi-lookups", async () => {
    const controller = new WebController({
      locator() {
        throw new Error("locator should not be called");
      },
    });

    await assert.rejects(
      () => controller.webFindAll(By.ID, "single-id", { timeout: 0.1 }),
      {
        name: "AssertionError",
        message: "Unsupported selector type: ID",
      },
    );
  });

  it("uses selector-specific timeout messages for failed single lookups", async () => {
    const controller = new WebController({
      locator(selector) {
        assert.equal(selector, "#missing-id");
        return {
          first() {
            return this;
          },
          async waitFor() {
            throw new TimeoutError("generic locator timeout");
          },
        };
      },
    });

    await assert.rejects(
      () => controller.webFind(By.ID, "missing-id", { timeout: 0.2 }),
      (error) =>
        error instanceof TimeoutError &&
        error.message ===
          "No HTML element found with ID 'missing-id' within 0.2 seconds.",
    );
  });

  it("uses selector-specific timeout messages for failed multi-lookups", async () => {
    const controller = new WebController({
      locator(selector) {
        assert.equal(selector, ".missing-class");
        return {
          async waitFor() {
            throw new TimeoutError("generic locator timeout");
          },
        };
      },
    });

    await assert.rejects(
      () => controller.webFindAll(By.CLASS_NAME, "missing-class", {
        timeout: 0.3,
      }),
      (error) =>
        error instanceof TimeoutError &&
        error.message ===
          "No HTML elements found with CSS class 'missing-class' " +
            "within 0.3 seconds.",
    );
  });
});
