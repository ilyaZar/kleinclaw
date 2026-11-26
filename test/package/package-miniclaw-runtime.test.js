import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  allowedDependencies,
  allowedDevDependencies,
  execFileAsync,
  linkRuntimeDependencies,
} from "../../test-support/package/package-boundary-fixture.js";

describe("packaged miniclaw runtime", () => {
  it("packs miniclaw as a standalone package and CLI", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-pack-"));
    const packDir = path.join(tmp, "pack");
    const extractDir = path.join(tmp, "extract");
    const consumerDir = path.join(tmp, "consumer");

    try {
      await fs.mkdir(packDir, { recursive: true });
      await fs.mkdir(extractDir, { recursive: true });
      await fs.mkdir(
        path.join(consumerDir, "node_modules", "@ilyazar"),
        { recursive: true },
      );

      const { stdout } = await execFileAsync(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", packDir],
        {
          cwd: path.join(process.cwd(), "miniclaw"),
          maxBuffer: 4_000_000,
        },
      );
      const [pack] = JSON.parse(stdout);
      const tarballPath = path.join(packDir, pack.filename);
      const files = new Set(pack.files.map((file) => file.path));
      const sourceManifest = JSON.parse(
        await fs.readFile("miniclaw/package.json", "utf8"),
      );

      assert.equal(pack.name, sourceManifest.name);
      assert.equal(pack.version, sourceManifest.version);
      for (const file of [
        "LICENSE",
        "NOTICE",
        "README.md",
        "dist/cli.js",
        "dist/index.d.ts",
        "dist/index.js",
        "package.json",
        "src/cli.ts",
        "src/index.ts",
      ]) {
        assert.equal(files.has(file), true, `${file} should be published`);
      }
      assert.equal(files.has("LICENSE.txt"), false);

      await execFileAsync("tar", ["-xzf", tarballPath, "-C", extractDir]);
      const packageRoot = path.join(extractDir, "package");
      const manifest = JSON.parse(
        await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
      );

      assert.equal(manifest.name, "@ilyazar/miniclaw");
      assert.equal(manifest.license, "AGPL-3.0-or-later");
      assert.equal(manifest.bin.miniclaw, "./dist/cli.js");
      assert.deepEqual(Object.keys(manifest.exports), [".", "./cli"]);
      assert.equal(manifest.publishConfig.access, "public");
      assert.deepEqual(manifest.dependencies, allowedDependencies);
      assert.match(
        await fs.readFile(path.join(packageRoot, "LICENSE"), "utf8"),
        /GNU AFFERO GENERAL PUBLIC LICENSE/,
      );
      assert.match(
        await fs.readFile(path.join(packageRoot, "NOTICE"), "utf8"),
        /TypeScript port and adaptation/,
      );

      await linkRuntimeDependencies(packageRoot);
      await fs.symlink(
        packageRoot,
        path.join(consumerDir, "node_modules", "@ilyazar", "miniclaw"),
        "dir",
      );
      await fs.writeFile(
        path.join(consumerDir, "package.json"),
        JSON.stringify({ type: "module" }),
        "utf8",
      );
      await fs.writeFile(
        path.join(consumerDir, "import-check.mjs"),
        [
          'import * as miniclaw from "@ilyazar/miniclaw";',
          'import * as cli from "@ilyazar/miniclaw/cli";',
          "console.log(JSON.stringify({",
          "  cliKeys: Object.keys(cli),",
          "  rootKeys: Object.keys(miniclaw),",
          "}));",
        ].join("\n"),
        "utf8",
      );
      const imported = await execFileAsync(
        process.execPath,
        ["import-check.mjs"],
        { cwd: consumerDir },
      );
      assert.deepEqual(JSON.parse(imported.stdout), {
        cliKeys: ["run"],
        rootKeys: ["run"],
      });

      await fs.writeFile(
        path.join(consumerDir, "types-check.ts"),
        [
          'import { run } from "@ilyazar/miniclaw";',
          "// @ts-expect-error domain models are not public exports",
          'import { Config } from "@ilyazar/miniclaw";',
          "const runResult: Promise<number> = " +
            "run(['node', 'miniclaw', 'help']);",
          "// @ts-expect-error injection hooks are not public run options",
          "run(['node', 'miniclaw', 'help'], { sideEffects: {} });",
          "void [Config, runResult];",
        ].join("\n"),
        "utf8",
      );
      await execFileAsync(
        process.execPath,
        [
          path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc"),
          "--module",
          "NodeNext",
          "--moduleResolution",
          "NodeNext",
          "--noEmit",
          "--strict",
          "--target",
          "ES2022",
          "types-check.ts",
        ],
        { cwd: consumerDir },
      );

      await fs.writeFile(
        path.join(consumerDir, "deep-import-check.mjs"),
        [
          "try {",
          '  await import("@ilyazar/miniclaw/workspace");',
          "  process.exitCode = 1;",
          "} catch (error) {",
          "  console.log(error.code);",
          "}",
        ].join("\n"),
        "utf8",
      );
      const deepImport = await execFileAsync(
        process.execPath,
        ["deep-import-check.mjs"],
        { cwd: consumerDir },
      );
      assert.equal(
        deepImport.stdout.trim(),
        "ERR_PACKAGE_PATH_NOT_EXPORTED",
      );

      const cliPath = path.join(packageRoot, manifest.bin.miniclaw);
      const binDir = path.join(tmp, "bin");
      const binPath = path.join(binDir, "miniclaw");
      await fs.mkdir(binDir, { recursive: true });
      await fs.chmod(cliPath, 0o755);
      await fs.symlink(cliPath, binPath, "file");

      const version = await execFileAsync(binPath, ["version"]);
      const help = await execFileAsync(binPath, ["help"]);
      const structured = await execFileAsync(
        binPath,
        ["--output=json", "version"],
      );
      assert.equal(version.stdout.trim(), manifest.version);
      assert.match(help.stdout, /^Usage: miniclaw COMMAND \[OPTIONS\]/);
      assert.equal(JSON.parse(structured.stdout).version, manifest.version);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("embeds an importable built miniclaw runtime", async () => {
    const miniclaw = await import("../../miniclaw/dist/index.js");
    const miniclawPkg = JSON.parse(
      await fs.readFile("miniclaw/package.json", "utf8"),
    );

    assert.equal(miniclawPkg.license, "AGPL-3.0-or-later");
    for (const script of ["preinstall", "install", "postinstall", "prepare"]) {
      assert.equal(miniclawPkg.scripts?.[script], undefined);
    }
    assert.deepEqual(miniclawPkg.devDependencies, allowedDevDependencies);
    assert.deepEqual(miniclawPkg.dependencies, allowedDependencies);
    assert.equal(
      Object.hasOwn(miniclawPkg.dependencies, "playwright-core"),
      false,
    );
    assert.deepEqual(Object.keys(miniclaw), ["run"]);
    assert.deepEqual(
      miniclawPkg.exports["./cli"],
      miniclawPkg.exports["."],
    );
  });

  it("keeps embedded miniclaw defaults local to miniclaw", async () => {
    const { APP_NAME } = await import("../../miniclaw/dist/workspace.js");
    const cliHelp = await import("../../miniclaw/dist/cli/cli-help.js");
    const persistence = await import(
      "../../miniclaw/dist/download-extractor/" +
        "download-extractor-persistence.js"
    );
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-defaults-"));
    const configPath = path.join(tmp, "config.yaml");

    assert.equal(APP_NAME, "miniclaw");
    assert.match(
      cliHelp.DEFAULT_CONFIG,
      /miniclaw:\/\/schemas\/config\.schema\.json/,
    );
    assert.doesNotMatch(cliHelp.DEFAULT_CONFIG, /kleinanzeigen-bot/);
    assert.doesNotMatch(cliHelp.DEFAULT_CONFIG, /update_check/);
    assert.match(cliHelp.usage(), /--ad-file=<PATH> \(repeatable\)/);
    assert.doesNotMatch(cliHelp.usage(), /--lang|--verbose|update-check/);
    assert.equal(
      persistence.AD_SCHEMA_HEADER,
      "# yaml-language-server: $schema=miniclaw://schemas/ad.schema.json",
    );

    await execFileAsync(process.execPath, [
      "miniclaw/dist/cli.js",
      "create-config",
      "--config",
      configPath,
    ]);
    const generatedConfig = await fs.readFile(configPath, "utf8");
    assert.match(
      generatedConfig,
      /miniclaw:\/\/schemas\/config\.schema\.json/,
    );
    assert.doesNotMatch(generatedConfig, /kleinanzeigen-bot/);
  });
});
