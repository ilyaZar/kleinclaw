import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

import { createKleinanzeigenTools } from "../src/tools.js";

const execFileAsync = promisify(execFile);

async function npmPackDryRunFiles() {
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      cwd: process.cwd(),
      maxBuffer: 4_000_000,
    },
  );
  const [pack] = JSON.parse(stdout);
  return new Set(pack.files.map((entry) => entry.path));
}

describe("package install boundary", () => {
  it("does not install the upstream bot through lifecycle scripts", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    const lifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];

    for (const script of lifecycleScripts) {
      assert.equal(pkg.scripts?.[script], undefined);
    }
    assert.equal(pkg.dependencies, undefined);
  });

  it("publishes the plugin implementation and bundled helper skill", async () => {
    const files = await npmPackDryRunFiles();
    const requiredFiles = [
      "index.js",
      "openclaw.plugin.json",
      "src/cli.js",
      "src/tools.js",
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

  it("ships a real helper skill, not package metadata as SKILL.md", async () => {
    const skill = await fs.readFile("skills/kleinanzeigen-helper-skill/SKILL.md", "utf8");

    assert.match(skill, /^---\nname: kleinanzeigen-helper-skill\n/m);
    assert.match(skill, /# Kleinanzeigen Helper/);
    assert.doesNotMatch(skill, /"openclaw"\s*:/);
    assert.doesNotMatch(skill, /"scripts"\s*:/);
  });

  it("keeps local guidance, tests, coverage, and unused assets out of the package", async () => {
    const files = await npmPackDryRunFiles();
    const forbiddenFiles = [
      "AGENTS.md",
      "lcov.info",
      "test/cli.test.js",
      "test/tools.test.js",
      "assets/repo_logo2.png",
      "assets/repo_logo.png",
      "assets/repo_logo_upstream.png",
      "docs/badges/openclaw-code-plugin.svg",
    ];

    for (const file of forbiddenFiles) {
      assert.equal(files.has(file), false, `${file} should not be published`);
    }
  });

  it("uses absolute README image URLs for registry renderers", async () => {
    const readme = await fs.readFile("README.md", "utf8");
    const imageSrcs = [...readme.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(
      ([, src]) => src,
    );

    assert.notEqual(imageSrcs.length, 0);

    for (const src of imageSrcs) {
      assert.match(src, /^https:\/\//, `${src} should be absolute`);
    }
  });

  it("keeps OpenClaw package metadata consistent with published files", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    const manifest = JSON.parse(await fs.readFile("openclaw.plugin.json", "utf8"));
    const files = await npmPackDryRunFiles();

    for (const extension of pkg.openclaw.extensions) {
      assert.equal(files.has(extension.replace(/^\.\//, "")), true);
    }

    assert.deepEqual(manifest.skills, ["./skills"]);
    assert.equal(files.has("skills/kleinanzeigen-helper-skill/SKILL.md"), true);
  });

  it("keeps manifest tool contracts aligned with registered tools", async () => {
    const manifest = JSON.parse(await fs.readFile("openclaw.plugin.json", "utf8"));
    const toolNames = createKleinanzeigenTools().map((tool) => tool.name);

    assert.deepEqual(manifest.contracts.tools, toolNames);
  });
});
