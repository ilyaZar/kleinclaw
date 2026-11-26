import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { run } from "../dist/cli.js";
import { parseArgs } from "../dist/cli/cli-parser.js";
import { planCommand } from "../dist/cli/cli-planning.js";
import {
  captureStderr,
  createListingWorkspace,
} from "../test-support/cli-gates-fixture.js";

describe("miniclaw CLI planning", () => {
  it("rejects removed no-op options and update checks", async () => {
    for (const option of ["--lang=en", "--verbose", "-v"]) {
      assert.throws(
        () => parseArgs(["node", "miniclaw", option, "verify"]),
        /unknown option/,
      );
    }

    const updateCheck = await captureStderr(
      () => run(["node", "miniclaw", "update-check"]),
    );
    assert.equal(updateCheck.result, 2);
    assert.deepEqual(updateCheck.lines, ["Unknown command: update-check"]);
  });

  it("frames parse failures when JSON output was requested", async () => {
    for (const argv of [
      ["node", "miniclaw", "--output=json", "--unknown", "version"],
      ["node", "miniclaw", "--output=json", "version", "help"],
    ]) {
      const output = await captureStderr(
        () => assert.rejects(() => run(argv)),
      );
      assert.equal(output.stdout.length, 1);
      assert.equal(JSON.parse(output.stdout[0]).status, "failed");
    }
  });

  it("reports changed and skipped content hashes coherently", async () => {
    const { configPath, tmp } = await createListingWorkspace();
    const argv = [
      "node",
      "miniclaw",
      "--output=json",
      "--workspace-mode=portable",
      `--config=${configPath}`,
      "update-content-hash",
    ];
    try {
      const first = await captureStderr(() => run(argv));
      const second = await captureStderr(() => run(argv));
      assert.deepEqual(JSON.parse(first.stdout[0]).counts, {
        changed: 1,
        failed: 0,
        skipped: 0,
        total: 1,
      });
      assert.deepEqual(JSON.parse(second.stdout[0]), {
        schemaVersion: 1,
        command: "update-content-hash",
        status: "no_op",
        counts: {
          changed: 0,
          failed: 0,
          skipped: 1,
          total: 1,
        },
      });
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("plans verify without browser automation and keeps selected ad context", async () => {
    const { configPath, tmp } = await createListingWorkspace();
    try {
      const plan = await planCommand(
        parseArgs(["node", "miniclaw", "--config", configPath, "verify"]),
      );

      assert.equal(plan.command, "verify");
      assert.equal(plan.adsSelector, "all");
      assert.equal(plan.loadAds, true);
      assert.equal(plan.excludeAdsWithId, false);
      assert.equal(plan.needsBrowser, false);
      assert.equal(plan.selectedCount, 1);
      assert.deepEqual(plan.selectedAds, [{
        active: true,
        id: null,
        relativePath: "ads/listing/ad.yaml",
        title: "cli gate listing",
      }]);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("plans against explicit ad file overrides", async () => {
    const { configPath, tmp } = await createListingWorkspace();
    const scopedDir = path.join(tmp, "scoped");
    const scopedAdPath = path.join(scopedDir, "ad.yaml");
    try {
      await fs.mkdir(scopedDir, { recursive: true });
      await fs.writeFile(
        scopedAdPath,
        [
          "active: true",
          "title: explicit scoped listing",
          "description: only selected through the CLI ad file override",
          "category: Audio_und_Hifi",
          "price_type: NEGOTIABLE",
          "",
        ].join("\n"),
        "utf8",
      );

      const parsed = parseArgs([
        "node",
        "miniclaw",
        "--config",
        configPath,
        "--ad-file",
        scopedAdPath,
        "verify",
      ]);
      const plan = await planCommand(parsed);

      assert.deepEqual(parsed.adFileOverrides, [scopedAdPath]);
      assert.equal(plan.command, "verify");
      assert.equal(plan.selectedCount, 1);
      assert.deepEqual(plan.selectedAds.map((ad) => ad.title), [
        "explicit scoped listing",
      ]);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("plans download as a browser-gated command without reading local ads", async () => {
    const plan = await planCommand(
      parseArgs(["node", "miniclaw", "download", "--ads", "new"]),
    );

    assert.equal(plan.command, "download");
    assert.equal(plan.adsSelector, "new");
    assert.equal(plan.loadAds, false);
    assert.equal(plan.needsBrowser, true);
    assert.equal(plan.selectedCount, null);
  });
});
