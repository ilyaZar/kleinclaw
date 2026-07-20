import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import { createKleinanzeigenTools } from "../../dist/tools.js";
import {
  allowedDependencies,
  allowedDevDependencies,
  npmPackDryRunFiles,
} from "../../test-support/package/package-boundary-fixture.js";

describe("package metadata", () => {
  it("does not run external setup through lifecycle scripts", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    const lifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];

    for (const script of lifecycleScripts) {
      assert.equal(pkg.scripts?.[script], undefined);
    }
    assert.equal(
      pkg.scripts?.build,
      "npm run clean:generated && npm run build:miniclaw && npm run build:host",
    );
    assert.equal(pkg.scripts?.["build:host"], "tsc -p tsconfig.host.json");
    assert.equal(
      pkg.scripts?.["build:miniclaw"],
      "tsc -p tsconfig.miniclaw.json",
    );
    assert.equal(
      pkg.scripts?.["clean:generated"],
      "node scripts/clean-generated.mjs",
    );
    assert.deepEqual(pkg.dependencies, allowedDependencies);
    assert.deepEqual(pkg.devDependencies, allowedDevDependencies);
  });

  it("keeps the package lock scoped to embedded miniclaw dependencies", async () => {
    const lockText = await fs.readFile("package-lock.json", "utf8");
    const lock = JSON.parse(lockText);

    assert.deepEqual(lock.packages?.[""]?.dependencies, allowedDependencies);
    assert.deepEqual(
      lock.packages?.[""]?.devDependencies,
      allowedDevDependencies,
    );
    assert.doesNotMatch(lockText, /kleinanzeigen-bot/);
    assert.doesNotMatch(lockText, /cliPath/);
    assert.doesNotMatch(lockText, /projects\/various/);

    for (const [packagePath, entry] of Object.entries(lock.packages ?? {})) {
      assert.doesNotMatch(
        packagePath,
        /kleinanzeigen-bot|projects\/various/,
      );
      assert.doesNotMatch(
        String(entry.resolved ?? ""),
        /^file:|kleinanzeigen-bot/,
      );
    }
  });

  it("keeps OpenClaw package metadata consistent with published files", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    const manifest = JSON.parse(
      await fs.readFile("openclaw.plugin.json", "utf8"),
    );
    const readme = await fs.readFile("README.md", "utf8");
    const files = await npmPackDryRunFiles();

    assert.equal(pkg.license, "AGPL-3.0-or-later");
    assert.match(
      await fs.readFile("LICENSE", "utf8"),
      /GNU AFFERO GENERAL PUBLIC LICENSE/,
    );
    assert.match(
      await fs.readFile("miniclaw/LICENSE", "utf8"),
      /GNU AFFERO GENERAL PUBLIC LICENSE/,
    );
    assert.match(
      await fs.readFile("miniclaw/NOTICE", "utf8"),
      /AGPL-3\.0-or-later/,
    );
    assert.equal(pkg.openclaw.install.minHostVersion, ">=2026.6.5");
    assert.equal(pkg.peerDependencies.openclaw, ">=2026.6.5");
    assert.equal(pkg.openclaw.compat.minGatewayVersion, "2026.6.5");
    assert.equal(pkg.openclaw.build.openclawVersion, "2026.6.5");
    assert.equal(pkg.openclaw.build.pluginSdkVersion, "2026.6.5");

    for (const extension of pkg.openclaw.extensions) {
      assert.equal(files.has(extension.replace(/^\.\//, "")), true);
    }

    assert.deepEqual(manifest.skills, ["./skills"]);
    assert.equal(
      Object.hasOwn(manifest.configSchema.properties, "cliPath"),
      false,
    );
    assert.equal(
      files.has("skills/kleinanzeigen-helper-skill/SKILL.md"),
      true,
    );
    for (const name of [
      ...manifest.contracts.tools,
      ...Object.keys(manifest.configSchema.properties),
    ]) {
      assert.equal(
        readme.includes(`\`${name}\``),
        true,
        `README should document ${name}`,
      );
    }
  });

  it("keeps manifest tool contracts aligned with registered tools", async () => {
    const manifest = JSON.parse(
      await fs.readFile("openclaw.plugin.json", "utf8"),
    );
    const toolNames = createKleinanzeigenTools().map((tool) => tool.name);

    assert.deepEqual(manifest.contracts.tools, toolNames);
  });
});
