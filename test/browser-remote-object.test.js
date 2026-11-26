import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  convertRemoteObjectValue,
  normalizeRemoteObjectResult,
} from "../dist/browser/browser-remote-object.js";

describe("miniclaw browser remote objects", () => {
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
