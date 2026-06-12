import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Config } from "../miniclaw/dist/model/config-model.js";
import { loadSelectedAds } from "../miniclaw/dist/selection.js";

describe("miniclaw ad selection", () => {
  it("expands ad image globs to concrete absolute image files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-selection-"));
    const adDir = path.join(tmp, "ads", "boxen");
    const configPath = path.join(tmp, "config.yaml");
    const adPath = path.join(adDir, "ad.yaml");

    try {
      await fs.mkdir(adDir, { recursive: true });
      await fs.writeFile(
        configPath,
        [
          "ad_files:",
          "  - ads/**/ad.yaml",
          "categories: {}",
          "",
        ].join("\n"),
      );
      await fs.writeFile(
        adPath,
        [
          "active: true",
          "title: concrete image expansion",
          "description: expands brace image globs before live upload",
          "category: Audio_und_Hifi",
          "price_type: NEGOTIABLE",
          "images:",
          "  - \"boxen_*.{jpg,png}\"",
          "",
        ].join("\n"),
      );
      await fs.writeFile(path.join(adDir, "boxen_b.jpg"), "jpg");
      await fs.writeFile(path.join(adDir, "boxen_a.png"), "png");
      await fs.writeFile(path.join(adDir, "boxen_ignored.txt"), "txt");

      const [loaded] = await loadSelectedAds({
        config: new Config({ ad_files: ["ads/**/ad.yaml"], categories: {} }),
        configPath,
        selector: "all",
      });

      assert.deepEqual(loaded.ad.images, [
        path.join(adDir, "boxen_a.png"),
        path.join(adDir, "boxen_b.jpg"),
      ]);
      assert.equal(loaded.ad.category, "161/172/sonstiges");
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("lets config categories override built-in category aliases", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-category-"));
    const adPath = path.join(tmp, "ad.yaml");

    try {
      await fs.writeFile(
        adPath,
        [
          "active: true",
          "title: custom category override",
          "description: config categories should override built-ins",
          "category: Audio_und_Hifi",
          "price_type: NEGOTIABLE",
          "",
        ].join("\n"),
      );

      const [loaded] = await loadSelectedAds({
        config: new Config({
          ad_files: ["ad.yaml"],
          categories: { Audio_und_Hifi: "custom/category" },
        }),
        configPath: path.join(tmp, "config.yaml"),
        selector: "all",
      });

      assert.equal(loaded.ad.category, "custom/category");
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("validates before numeric-id filtering like Python", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-numeric-"));
    const validDir = path.join(tmp, "ads", "valid");
    const invalidDir = path.join(tmp, "ads", "invalid");

    try {
      await fs.mkdir(validDir, { recursive: true });
      await fs.mkdir(invalidDir, { recursive: true });
      await fs.writeFile(
        path.join(validDir, "ad.yaml"),
        [
          "active: true",
          "id: 123",
          "title: selected numeric listing",
          "description: this one matches the numeric selector",
          "category: Audio_und_Hifi",
          "price_type: NEGOTIABLE",
          "",
        ].join("\n"),
      );
      await fs.writeFile(
        path.join(invalidDir, "ad.yaml"),
        [
          "active: true",
          "id: 999",
          "title: " +
            "this title is intentionally too long for the configured ad set " +
            "validation",
          "description: python validates this before checking numeric ids",
          "category: Audio_und_Hifi",
          "price_type: NEGOTIABLE",
          "",
        ].join("\n"),
      );

      await assert.rejects(
        loadSelectedAds({
          config: new Config({ ad_files: ["ads/**/ad.yaml"], categories: {} }),
          configPath: path.join(tmp, "config.yaml"),
          selector: "123",
        }),
        /title length exceeds 65 characters/,
      );
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });
});
