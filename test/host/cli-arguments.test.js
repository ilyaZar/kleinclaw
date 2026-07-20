import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildKleinanzeigenArgs } from "../../dist/cli.js";
import { redactArgs } from "../../dist/process-boundary.js";

describe("kleinanzeigen CLI argument builder", () => {
  it("builds fixed verify args with redacted config args", () => {
    const args = buildKleinanzeigenArgs(
      "verify",
      {},
      {
        configPath: "/secret/config.yaml",
        workspaceMode: "portable",
      },
    );

    assert.deepEqual(args, [
      "--config=/secret/config.yaml",
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      "verify",
    ]);
    assert.deepEqual(redactArgs(args), [
      "--config=[redacted]",
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      "verify",
    ]);
  });

  it("passes scoped ad file overrides without exposing them in command metadata", () => {
    const args = buildKleinanzeigenArgs(
      "verify",
      {},
      {
        configPath: "/secret/config.yaml",
        adFileOverrides: ["/secret/ads/lamp/ad.yaml"],
      },
    );

    assert.deepEqual(args, [
      "--config=/secret/config.yaml",
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      "--ad-file=/secret/ads/lamp/ad.yaml",
      "verify",
    ]);
    assert.deepEqual(redactArgs(args), [
      "--config=[redacted]",
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      "--ad-file=[redacted]",
      "verify",
    ]);
  });

  it("requires confirmation and numeric ad IDs for delete", () => {
    assert.throws(
      () => buildKleinanzeigenArgs("delete", { adIds: ["123"] }),
      /confirm must be true/,
    );
    assert.throws(
      () =>
        buildKleinanzeigenArgs(
          "delete",
          { confirm: true, adIds: ["123;rm"] },
          { configPath: "config.yaml" },
        ),
      /numeric ad IDs/,
    );

    assert.deepEqual(
      buildKleinanzeigenArgs(
        "delete",
        { confirm: true, adIds: ["123", "456"] },
        { configPath: "config.yaml" },
      ),
      [
        "--config=config.yaml",
        "--logfile=",
        "--workspace-mode=portable",
        "--output=json",
        "--allow-live-browser",
        "delete",
        "--ads=123,456",
      ],
    );
  });

  it("rejects unsupported selectors instead of forwarding arbitrary args", () => {
    assert.throws(
      () =>
        buildKleinanzeigenArgs(
          "publish",
          { confirm: true, selector: "--help" },
          { configPath: "config.yaml" },
        ),
      /selector must be one of/,
    );
    assert.throws(
      () =>
        buildKleinanzeigenArgs(
          "publish",
          { confirm: true, selectors: ["changed", "--help"] },
          { configPath: "config.yaml" },
        ),
      /selectors must contain only/,
    );
  });

  it("supports current update and extend selectors", () => {
    assert.deepEqual(
      buildKleinanzeigenArgs(
        "update",
        { confirm: true, selector: "all" },
        { configPath: "config.yaml" },
      ),
      [
        "--config=config.yaml",
        "--logfile=",
        "--workspace-mode=portable",
        "--output=json",
        "--allow-live-browser",
        "update",
        "--ads=all",
      ],
    );
    assert.throws(
      () =>
        buildKleinanzeigenArgs(
          "publish",
          { confirm: true, adIds: ["123"], selector: "due" },
          { configPath: "config.yaml" },
        ),
      /adIds cannot be combined/,
    );
    assert.deepEqual(
      buildKleinanzeigenArgs(
        "publish",
        { confirm: true, selectors: ["changed", "due", "changed"] },
        { configPath: "config.yaml" },
      ),
      [
        "--config=config.yaml",
        "--logfile=",
        "--workspace-mode=portable",
        "--output=json",
        "--allow-live-browser",
        "publish",
        "--ads=changed,due",
      ],
    );
    assert.deepEqual(
      buildKleinanzeigenArgs(
        "extend",
        { confirm: true },
        { configPath: "config.yaml" },
      ),
      [
        "--config=config.yaml",
        "--logfile=",
        "--workspace-mode=portable",
        "--output=json",
        "--allow-live-browser",
        "extend",
        "--ads=all",
      ],
    );
  });
});
