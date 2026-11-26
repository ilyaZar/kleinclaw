import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  draftKleinanzeigenAd,
  getKleinanzeigenAdSchema,
  listKleinanzeigenImages,
  readKleinanzeigenAd,
  setKleinanzeigenAdActive,
} from "../../dist/cli.js";

describe("ad authoring tools", () => {
  it("returns ad schema guidance without reading local config", () => {
    const result = getKleinanzeigenAdSchema();

    assert.equal(result.ok, true);
    assert.equal(result.operation, "ad_schema");
    assert.deepEqual(result.schema.requiredForDraft, [
      "title",
      "description",
      "category",
    ]);
    assert.equal(result.schema.limits.title.maxLength, 65);
    assert.equal(result.schema.template.active, false);
  });

  it("reads one selected ad with contact fields redacted by default", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-read-ad-"));
    const adDir = path.join(tmp, "drafts", "sample-listing");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      adPath,
      [
        "active: true",
        "title: Sample Listing Audio",
        "description: Guter Zustand",
        "category: Elektronik > Audio",
        "contact:",
        "  name: Secret Name",
        "  phone: \"01234\"",
      ].join("\n"),
      "utf8",
    );

    const result = await readKleinanzeigenAd(
      { adDirectories: [adDir] },
      { adRoots: [tmp] },
    );

    assert.equal(result.ok, true);
    assert.equal(
      result.adPath,
      path.join("drafts", "sample-listing", "ad.yaml"),
    );
    assert.equal(result.summary.title, "Sample Listing Audio");
    assert.match(result.yaml, /name: \[redacted-contact\]/);
    assert.doesNotMatch(result.yaml, /Secret Name|01234/);
  });

  it("lists local image files with dimensions and miniclaw support", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-images-"));
    const adDir = path.join(tmp, "drafts", "sample-listing");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      path.join(adDir, "sample-listing.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2jvWyAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    await fs.writeFile(path.join(adDir, "ignore.txt"), "not an image", "utf8");

    const result = await listKleinanzeigenImages(
      { directory: adDir },
      { adRoots: [tmp] },
    );

    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.equal(result.images[0].file, "sample-listing.png");
    assert.equal(result.images[0].width, 2);
    assert.equal(result.images[0].height, 3);
    assert.equal(result.images[0].supportedByMiniclaw, true);
  });

  it("creates a safe inactive ad draft under configured roots", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-draft-"));
    const adDir = path.join(tmp, "drafts", "sample-listing");

    const result = await draftKleinanzeigenAd(
      {
        confirm: true,
        directory: adDir,
        title: "Sample Listing Audio",
        description: "Guter Zustand.\nAbholung bevorzugt.",
        category: "Elektronik > Audio",
        price: 25,
        priceType: "NEGOTIABLE",
        shippingType: "PICKUP",
        images: ["sample-listing_*.{jpg,png}"],
        specialAttributes: { condition_s: "like_new" },
      },
      { adRoots: [tmp] },
    );
    const yaml = await fs.readFile(path.join(adDir, "ad.yaml"), "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.active, false);
    assert.match(yaml, /active: false/);
    assert.match(yaml, /title: "Sample Listing Audio"/);
    assert.match(yaml, /description: \|/);
    assert.match(yaml, /condition_s: "like_new"/);
    assert.match(yaml, /images:\n  - "sample-listing_\*\.\{jpg,png\}"/);
  });

  it("rejects draft image paths that escape the ad directory", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-draft-"));

    await assert.rejects(
      () =>
        draftKleinanzeigenAd(
          {
            confirm: true,
            directory: path.join(tmp, "draft"),
            title: "Sample Listing Audio",
            description: "Guter Zustand",
            category: "Elektronik > Audio",
            images: ["../secret.jpg"],
          },
          { adRoots: [tmp] },
        ),
      /relative to the ad directory/,
    );
  });

  it("sets one YAML ad active without rewriting other fields", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-active-"));
    const adDir = path.join(tmp, "drafts", "lamp");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      adPath,
      [
        "# yaml-language-server: $schema=https://example.invalid/ad.schema.json",
        "active: false",
        "title: Schreibtischlampe aus Metall",
        "category: Haus & Garten",
        "images:",
        "  - lampe_*.jpg",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await setKleinanzeigenAdActive(
      {
        confirm: true,
        adDirectories: [adDir],
        active: true,
      },
      { adRoots: [tmp] },
    );
    const yaml = await fs.readFile(adPath, "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.previousActive, false);
    assert.equal(result.active, true);
    assert.equal(result.summary.active, true);
    assert.match(yaml, /^active: true$/m);
    assert.match(yaml, /title: Schreibtischlampe aus Metall/);
    assert.match(yaml, /  - lampe_\*\.jpg/);
  });

  it("inserts an active flag when a YAML ad has no active field", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-active-"));
    const adDir = path.join(tmp, "drafts", "lamp");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      adPath,
      [
        "# yaml-language-server: $schema=https://example.invalid/ad.schema.json",
        "title: Schreibtischlampe aus Metall",
        "category: Haus & Garten",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await setKleinanzeigenAdActive(
      {
        confirm: true,
        adConfigPaths: [adPath],
        active: true,
      },
      { adRoots: [tmp] },
    );
    const yaml = await fs.readFile(adPath, "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.previousActive, null);
    assert.match(yaml, /^# yaml-language-server: .+\nactive: true\ntitle:/);
  });
});
