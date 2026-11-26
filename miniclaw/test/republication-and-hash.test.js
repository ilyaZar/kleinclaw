import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildBrowserSessionPlan } from "../dist/browser/browser-session-plan.js";
import { updateContentHashes } from "../dist/cli/cli-local-commands.js";
import { parseArgs } from "../dist/cli/cli-parser.js";
import { loadConfigFile } from "../dist/io.js";
import { Config } from "../dist/model/config-model.js";
import { isChangedAd, isDueForRepublication, loadSelectedAds } from "../dist/selection.js";

describe("miniclaw republication timing", () => {
  it("is due on the day the interval is reached", () => {
    const ad = { createdOn: new Date("2026-06-01T10:00:00Z"), republicationInterval: 7, updatedOn: null };
    assert.equal(isDueForRepublication(ad, new Date("2026-06-07T12:00:00Z")), false);
    assert.equal(isDueForRepublication(ad, new Date("2026-06-08T12:00:00Z")), true);
  });
});

describe("miniclaw content hash", () => {
  it("stores the hash that the change detection computes", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-hash-"));
    try {
      const configPath = path.join(tmp, "config.yaml");
      await fs.writeFile(configPath, "ad_files:\n  - ads/**/ad.yaml\ncategories: {}\n");
      await fs.mkdir(path.join(tmp, "ads", "tisch"), { recursive: true });
      await fs.writeFile(path.join(tmp, "ads", "tisch", "ad.yaml"), [
        "active: true",
        "id: 123",
        "title: Ein schöner Tisch aus Holz",
        "description: Massivholz, gut erhalten.",
        "category: 80/83",
        "price: 50",
        "price_type: FIXED",
        "shipping_type: PICKUP",
        "content_hash: stale",
        "",
      ].join("\n"));

      await updateContentHashes(parseArgs(["node", "miniclaw", `--config=${configPath}`, "update-content-hash"]));

      const config = await loadConfigFile(configPath);
      const [loaded] = await loadSelectedAds({
        config,
        configPath,
        excludeAdsWithId: false,
        selector: "all",
      });
      assert.equal(isChangedAd(loaded.raw, loaded.ad), false);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });
});

describe("miniclaw browser window size", () => {
  it("keeps a desktop-sized window unless the user sized it", () => {
    const plan = (args) => buildBrowserSessionPlan(new Config({
      browser: { arguments: args, binary_location: "/usr/bin/true" },
    })).browserArgs;
    assert.ok(plan([]).includes("--window-size=1366,900"));
    assert.equal(plan(["--start-maximized"]).some((arg) => arg.startsWith("--window-size")), false);
    assert.deepEqual(plan(["--window-size=800,600"]).filter((arg) => arg.startsWith("--window-size")), ["--window-size=800,600"]);
  });
});
