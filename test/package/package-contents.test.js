import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import { parse as parseYaml } from "yaml";

import { toAd } from "../../miniclaw/dist/model/ad-normalization.js";
import {
  BUILTIN_CATEGORIES,
} from "../../miniclaw/dist/resources/categories.js";
import {
  npmPackDryRunFiles,
} from "../../test-support/package/package-boundary-fixture.js";

function stripLegalProvenance(content) {
  return content
    .split("\n")
    .filter((line) => !line.includes("SPDX-ArtifactOfProjectHomePage"))
    .join("\n");
}

describe("package contents", () => {
  it("publishes the plugin implementation and bundled helper skill", async () => {
    const files = await npmPackDryRunFiles();
    const requiredFiles = [
      "index.js",
      "LICENSE",
      "dist/cli.js",
      "dist/plugin-entry.js",
      "dist/tools.js",
      "examples/sample-listing/ad.yaml",
      "miniclaw/LICENSE",
      "miniclaw/NOTICE",
      "miniclaw/README.md",
      "miniclaw/package.json",
      "miniclaw/dist/cli.js",
      "miniclaw/dist/index.js",
      "miniclaw/src/cli.ts",
      "miniclaw/src/index.ts",
      "openclaw.plugin.json",
      "skills/kleinanzeigen-helper-skill/SKILL.md",
      "skills/kleinanzeigen-helper-skill/references/ad-authoring.md",
      "skills/kleinanzeigen-helper-skill/references/browser-behaviour.md",
      "skills/kleinanzeigen-helper-skill/references/draft-publish-preflight.md",
      "skills/kleinanzeigen-helper-skill/references/install.md",
      "skills/kleinanzeigen-helper-skill/references/listing-discovery-scoping.md",
      "skills/kleinanzeigen-helper-skill/references/non-negotiables.md",
      "skills/kleinanzeigen-helper-skill/references/publish-result-caveats.md",
      "skills/kleinanzeigen-helper-skill/references/tool-selection.md",
      "skills/kleinanzeigen-helper-skill/references/workflow.md",
    ];

    for (const file of requiredFiles) {
      assert.equal(files.has(file), true, `${file} should be published`);
    }
  });

  it("keeps local VM test material out of the package", async () => {
    const files = await npmPackDryRunFiles();

    await assert.rejects(fs.access("skills/local/kleinclaw-vm-drive"));
    for (const file of files) {
      assert.equal(file.startsWith("tmp/testing-vm/"), false);
      assert.equal(file.startsWith("skills/local/"), false);
      assert.equal(file.includes("kleinclaw-vm-drive"), false);
    }
  });

  it("ships an inactive miniclaw-shaped example ad", async () => {
    const exampleText = await fs.readFile(
      "examples/sample-listing/ad.yaml",
      "utf8",
    );
    const example = parseYaml(exampleText);
    const ad = toAd(example);

    assert.equal(ad.active, false);
    assert.equal(ad.type, "OFFER");
    assert.equal(ad.priceType, "NEGOTIABLE");
    assert.equal(ad.shippingType, "PICKUP");
    assert.equal(ad.sellDirectly, false);
    assert.equal(Object.hasOwn(BUILTIN_CATEGORIES, ad.category), true);
    assert.deepEqual(ad.images, ["images/*.{jpg,jpeg,png}"]);
  });

  it("ships a real helper skill, not package metadata as SKILL.md", async () => {
    const skill = await fs.readFile(
      "skills/kleinanzeigen-helper-skill/SKILL.md",
      "utf8",
    );

    assert.match(skill, /^---\nname: kleinanzeigen-helper-skill\n/m);
    assert.match(skill, /# Kleinanzeigen Helper/);
    assert.doesNotMatch(skill, /^license:/m);
    assert.doesNotMatch(skill, /MIT-0/);
    assert.doesNotMatch(skill, /"openclaw"\s*:/);
    assert.doesNotMatch(skill, /"scripts"\s*:/);
  });

  it("keeps local guidance, tests, coverage, and unused assets out of the package", async () => {
    const files = await npmPackDryRunFiles();
    const forbiddenFiles = [
      "AGENTS.md",
      "lcov.info",
      "package-lock.json",
      "tsconfig.host.json",
      "tsconfig.miniclaw.json",
      "node_modules/.package-lock.json",
      "reports/plugin-inspector-report.json",
      "reports/plugin-inspector-report.md",
      "reports/plugin-inspector-issues.md",
      "assets/repo_logo2.png",
      "assets/repo_logo.png",
      "assets/repo_logo_upstream.png",
      "assets/openclaw-code-plugin.svg",
      "specs/port_ts_plan.md",
      "miniclaw/test/package-surface.test.js",
      "miniclaw/src/resources/ad_fields.yaml",
      "miniclaw/src/resources/categories.yaml",
      "miniclaw/src/resources/categories_old.yaml",
      "miniclaw/src/resources/config_defaults.yaml",
      "miniclaw/src/resources/translations.de.yaml",
      "miniclaw/node_modules/yaml/package.json",
      "miniclaw/package-lock.json",
    ];

    for (const file of forbiddenFiles) {
      assert.equal(files.has(file), false, `${file} should not be published`);
    }
    const forbiddenPrefixes = [
      "assets/",
      "docs/",
      "node_modules/",
      "reports/",
      "specs/",
      "src/",
      "test/",
      "test-support/",
      "miniclaw/node_modules/",
      "miniclaw/scripts/",
      "miniclaw/test/",
    ];
    for (const file of files) {
      for (const prefix of forbiddenPrefixes) {
        assert.equal(
          file.startsWith(prefix),
          false,
          `${file} should not be published`,
        );
      }
    }
  });

  it("keeps published runtime files free of stale external runtime surface", async () => {
    const files = await npmPackDryRunFiles();
    const provenanceOnlyFiles = new Set([
      "CHANGELOG.md",
      "miniclaw/NOTICE",
    ]);
    const stalePatterns = [
      [/kleinanzeigen-bot/, "kleinanzeigen-bot"],
      [/cliPath/, "cliPath"],
      [/runtimeCommand/, "runtimeCommand"],
      [/external automation/i, "external automation"],
      [/external setup/i, "external setup"],
      [/\bbot\b/i, "bot"],
      [/playwright/i, "Playwright"],
      [/\bpython\b/i, "python"],
      [/\blegacy\b/i, "legacy"],
      [/renameExistingFolders|rename_existing_folders/, "renameExistingFolders"],
      [/kleinanzeigen-bot\.log/, "kleinanzeigen-bot.log"],
      [/docs\/CONFIGURATION/, "docs/CONFIGURATION"],
      [/\bupstream\b/i, "upstream"],
      [/parity build/i, "parity build"],
      [/\/home\/iz/, "/home/iz"],
      [/\bDropbox\b/, "Dropbox"],
      [/projects\/various/, "projects/various"],
      [/haus-und-hof/, "haus-und-hof"],
      [/eBay-kleinanzeigen/, "eBay-kleinanzeigen"],
      [/\bONGOING\b/, "ONGOING"],
      [/\bboxen\b/i, "boxen"],
      [/ONGOING\/boxen/, "ONGOING/boxen"],
      [
        /https:\/\/raw\.githubusercontent\.com\/Second-Hand-Friends/,
        "Second-Hand-Friends raw URL",
      ],
    ];

    for (const file of files) {
      if (provenanceOnlyFiles.has(file)) {
        continue;
      }
      const content = stripLegalProvenance(
        await fs.readFile(file, "utf8"),
      );
      for (const [pattern, label] of stalePatterns) {
        assert.doesNotMatch(
          content,
          pattern,
          `${file} should not contain ${label}`,
        );
      }
    }
  });

  it("uses registry-safe README image URLs and fallbacks", async () => {
    const readme = await fs.readFile("README.md", "utf8");
    const images = [...readme.matchAll(/<img\b([^>]*)>/g)]
      .map(([, attrs]) => ({
        alt: attrs.match(/\balt="([^"]+)"/)?.[1],
        src: attrs.match(/\bsrc="([^"]+)"/)?.[1],
      }));
    const files = await npmPackDryRunFiles();

    assert.notEqual(images.length, 0);

    for (const image of images) {
      assert.equal(typeof image.alt, "string");
      assert.equal(typeof image.src, "string");

      if (image.src.startsWith("https://")) {
        continue;
      }

      await fs.access(image.src);
      assert.equal(
        files.has(image.src),
        false,
        `${image.src} should fall back to alt text`,
      );
    }
  });
});
