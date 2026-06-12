import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createKleinanzeigenTools } from "../src/tools.js";

const execFileAsync = promisify(execFile);
const allowedDependencies = {
  "decimal.js": "^10.6.0",
  glob: "^13.0.6",
  "playwright-core": "^1.60.0",
  yaml: "^2.9.0",
};

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

async function writeFakeOpenClawSdk(root) {
  const fakeSdkDir = path.join(
    root,
    "node_modules",
    "openclaw",
    "dist",
    "plugin-sdk",
  );
  await fs.mkdir(fakeSdkDir, { recursive: true });
  await fs.writeFile(
    path.join(root, "node_modules", "openclaw", "package.json"),
    JSON.stringify({
      exports: {
        "./plugin-sdk/plugin-entry": "./dist/plugin-sdk/plugin-entry.js",
      },
      type: "module",
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(fakeSdkDir, "plugin-entry.js"),
    [
      "export function definePluginEntry(value) {",
      "  return { ...value, definedByFakeSdk: true };",
      "}",
    ].join("\n"),
    "utf8",
  );
}

async function linkRuntimeDependencies(root) {
  const nodeModules = path.join(root, "node_modules");
  await fs.mkdir(nodeModules, { recursive: true });
  for (const dependency of Object.keys(allowedDependencies)) {
    await fs.symlink(
      path.join(process.cwd(), "node_modules", dependency),
      path.join(nodeModules, dependency),
      "dir",
    );
  }
}

async function importEntrypoint(entryPath) {
  const entryUrl = pathToFileURL(entryPath);
  entryUrl.search = `v=${Date.now()}-${Math.random()}`;
  return await import(entryUrl.href);
}

function stripLegalProvenance(content) {
  return content
    .split("\n")
    .filter((line) => !line.includes("SPDX-ArtifactOfProjectHomePage"))
    .join("\n");
}

describe("package install boundary", () => {
  it("does not run external setup through lifecycle scripts", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    const lifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];

    for (const script of lifecycleScripts) {
      assert.equal(pkg.scripts?.[script], undefined);
    }
    assert.deepEqual(pkg.dependencies, allowedDependencies);
  });

  it("keeps the package lock scoped to embedded miniclaw dependencies", async () => {
    const lockText = await fs.readFile("package-lock.json", "utf8");
    const lock = JSON.parse(lockText);

    assert.deepEqual(lock.packages?.[""]?.dependencies, allowedDependencies);
    assert.doesNotMatch(lockText, /kleinanzeigen-bot/);
    assert.doesNotMatch(lockText, /cliPath/);
    assert.doesNotMatch(lockText, /projects\/various/);

    for (const [packagePath, entry] of Object.entries(lock.packages ?? {})) {
      assert.doesNotMatch(packagePath, /kleinanzeigen-bot|projects\/various/);
      assert.doesNotMatch(String(entry.resolved ?? ""), /^file:|kleinanzeigen-bot/);
    }
  });

  it("publishes the plugin implementation and bundled helper skill", async () => {
    const files = await npmPackDryRunFiles();
    const requiredFiles = [
      "index.js",
      "LICENSE",
      "LICENSES/MIT.txt",
      "miniclaw/LICENSE.txt",
      "miniclaw/README.md",
      "miniclaw/package.json",
      "miniclaw/dist/cli.js",
      "miniclaw/dist/index.js",
      "miniclaw/src/cli.ts",
      "miniclaw/src/index.ts",
      "openclaw.plugin.json",
      "src/cli.js",
      "src/plugin-entry.js",
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

  it("imports the root OpenClaw entrypoint with an SDK peer", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-entry-"));

    try {
      await fs.writeFile(
        path.join(tmp, "package.json"),
        JSON.stringify({ type: "module" }),
        "utf8",
      );
      await fs.copyFile("index.js", path.join(tmp, "index.js"));
      await fs.cp("src", path.join(tmp, "src"), { recursive: true });
      await fs.symlink(path.join(process.cwd(), "miniclaw"), path.join(tmp, "miniclaw"), "dir");
      await writeFakeOpenClawSdk(tmp);

      const imported = await importEntrypoint(path.join(tmp, "index.js"));
      const entry = imported.default;

      assert.equal(entry.definedByFakeSdk, true);
      assert.equal(entry.id, "kleinclaw");
      assert.equal(typeof entry.register, "function");
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("runs status and verify from the packed OpenClaw tarball artifact", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-pack-"));
    const packDir = path.join(tmp, "pack");
    const extractDir = path.join(tmp, "extract");
    const configPath = path.join(tmp, "config.yaml");
    const adPath = path.join(tmp, "ad.yaml");

    try {
      await fs.mkdir(packDir, { recursive: true });
      await fs.mkdir(extractDir, { recursive: true });
      await fs.writeFile(
        configPath,
        [
          "ad_files:",
          "  - ./ad.yaml",
          "categories: {}",
          "",
        ].join("\n"),
        { encoding: "utf8", mode: 0o600 },
      );
      await fs.writeFile(
        adPath,
        [
          "title: packed artifact smoke",
          "description: verifies the packed miniclaw runtime without a browser",
          "category: test-category",
          "price_type: NEGOTIABLE",
          "",
        ].join("\n"),
        { encoding: "utf8", mode: 0o600 },
      );
      const { stdout } = await execFileAsync(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", packDir],
        {
          cwd: process.cwd(),
          maxBuffer: 4_000_000,
        },
      );
      const [pack] = JSON.parse(stdout);
      const tarballPath = path.join(packDir, pack.filename);

      await execFileAsync("tar", ["-xzf", tarballPath, "-C", extractDir]);
      const packageRoot = path.join(extractDir, "package");
      await writeFakeOpenClawSdk(packageRoot);
      await linkRuntimeDependencies(packageRoot);

      const imported = await importEntrypoint(path.join(packageRoot, "index.js"));
      const entry = imported.default;
      const files = new Set(pack.files.map((file) => file.path));
      const registeredTools = [];
      const registeredHooks = [];
      const runCommandWithTimeout = async (argv, options = {}) => {
        try {
          const result = await execFileAsync(argv[0], argv.slice(1), {
            cwd: options.cwd,
            env: options.env,
            timeout: options.timeoutMs,
            maxBuffer: 1_000_000,
          });
          return { code: 0, signal: null, stdout: result.stdout, stderr: result.stderr };
        } catch (error) {
          return {
            code: Number.isInteger(error.code) ? error.code : null,
            signal: error.signal ?? null,
            stdout: error.stdout ?? "",
            stderr: error.stderr ?? "",
          };
        }
      };

      assert.equal(entry.definedByFakeSdk, true);
      assert.equal(entry.id, "kleinclaw");
      assert.equal(typeof entry.register, "function");
      assert.equal(files.has("miniclaw/dist/cli.js"), true);
      assert.equal(files.has("src/plugin-entry.js"), true);
      await fs.access(path.join(packageRoot, "miniclaw", "dist", "cli.js"));

      entry.register({
        pluginConfig: { configPath, timeoutMs: 15000 },
        runtime: { system: { runCommandWithTimeout } },
        on(eventName, handler, options) {
          registeredHooks.push({ eventName, handler, options });
        },
        registerTool(tool, options) {
          registeredTools.push({ tool, options });
        },
      });

      const statusTool = registeredTools.find(
        ({ tool }) => tool.name === "kleinanzeigen_status",
      )?.tool;
      const verifyTool = registeredTools.find(
        ({ tool }) => tool.name === "kleinanzeigen_verify",
      )?.tool;
      assert.equal(registeredTools.length, 16);
      assert.equal(registeredHooks.length, 1);
      assert.equal(typeof statusTool?.execute, "function");
      assert.equal(typeof verifyTool?.execute, "function");

      const statusResult = await statusTool.execute("status-pack-smoke", {});
      const statusPayload = JSON.parse(statusResult.content[0].text);

      assert.equal(statusPayload.ok, true);
      assert.equal(statusPayload.operation, "status");
      assert.equal(statusPayload.executable, "miniclaw");
      assert.equal(statusPayload.configFile.exists, true);
      assert.equal(statusPayload.configFile.isFile, true);
      assert.equal(statusPayload.commands.verify, true);
      assert.equal(statusPayload.commands.publish, true);
      assert.equal(statusPayload.needsUserAction, false);
      assert.doesNotMatch(statusResult.content[0].text, new RegExp(tmp));

      const verifyResult = await verifyTool.execute("verify-pack-smoke", {});
      const verifyPayload = JSON.parse(verifyResult.content[0].text);

      assert.equal(verifyPayload.ok, true);
      assert.equal(verifyPayload.operation, "verify");
      assert.equal(verifyPayload.command.executable, "miniclaw");
      assert.equal(verifyPayload.outcome.status, "succeeded");
      assert.match(
        [verifyPayload.stdout, verifyPayload.stderr].join("\n"),
        /DONE: No configuration errors found\./,
      );
      assert.equal(verifyPayload.needsUserAction, false);
      assert.doesNotMatch(verifyResult.content[0].text, new RegExp(tmp));
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("embeds an importable built miniclaw runtime", async () => {
    const miniclaw = await import("../miniclaw/dist/index.js");
    const cli = await import("../miniclaw/dist/cli.js");
    const miniclawPkg = JSON.parse(await fs.readFile("miniclaw/package.json", "utf8"));

    assert.equal(miniclawPkg.license, "AGPL-3.0-or-later");
    assert.equal(miniclawPkg.scripts, undefined);
    assert.equal(miniclawPkg.devDependencies, undefined);
    assert.deepEqual(miniclawPkg.dependencies, allowedDependencies);
    assert.equal(miniclaw.run, cli.run);
    assert.equal(typeof miniclaw.Config, "function");
    assert.equal(typeof miniclaw.runPublishAdsBatch, "function");
    assert.equal(typeof miniclaw.createBrowserPublishUpdateSideEffects, "function");
    assert.equal(miniclaw.publishAdForm, undefined);
  });

  it("keeps embedded miniclaw defaults local to miniclaw", async () => {
    const miniclaw = await import("../miniclaw/dist/index.js");
    const cliHelp = await import("../miniclaw/dist/cli/help.js");
    const persistence = await import("../miniclaw/dist/download-extractor/persistence.js");
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-defaults-"));
    const configPath = path.join(tmp, "config.yaml");

    assert.equal(miniclaw.APP_NAME, "miniclaw");
    assert.match(cliHelp.DEFAULT_CONFIG, /miniclaw:\/\/schemas\/config\.schema\.json/);
    assert.doesNotMatch(cliHelp.DEFAULT_CONFIG, /kleinanzeigen-bot/);
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
    assert.match(generatedConfig, /miniclaw:\/\/schemas\/config\.schema\.json/);
    assert.doesNotMatch(generatedConfig, /kleinanzeigen-bot/);
  });

  it("keeps local guidance, tests, coverage, and unused assets out of the package", async () => {
    const files = await npmPackDryRunFiles();
    const forbiddenFiles = [
      "AGENTS.md",
      "lcov.info",
      "package-lock.json",
      "test/cli.test.js",
      "test/tools.test.js",
      "node_modules/.package-lock.json",
      "reports/plugin-inspector-report.json",
      "reports/plugin-inspector-report.md",
      "reports/plugin-inspector-issues.md",
      "assets/repo_logo2.png",
      "assets/repo_logo.png",
      "assets/repo_logo_upstream.png",
      "docs/badges/openclaw-code-plugin.svg",
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
      "test/",
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
    const provenanceOnlyFiles = new Set(["miniclaw/LICENSE.txt"]);
    const stalePatterns = [
      [/kleinanzeigen-bot/, "kleinanzeigen-bot"],
      [/cliPath/, "cliPath"],
      [/runtimeCommand/, "runtimeCommand"],
      [/external automation/i, "external automation"],
      [/external setup/i, "external setup"],
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
      const content = stripLegalProvenance(await fs.readFile(file, "utf8"));
      for (const [pattern, label] of stalePatterns) {
        assert.doesNotMatch(content, pattern, `${file} should not contain ${label}`);
      }
    }
  });

  it("uses registry-safe README image URLs and fallbacks", async () => {
    const readme = await fs.readFile("README.md", "utf8");
    const images = [...readme.matchAll(/<img\b([^>]*)>/g)].map(([, attrs]) => ({
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
      assert.equal(files.has(image.src), false, `${image.src} should fall back to alt text`);
    }
  });

  it("keeps OpenClaw package metadata consistent with published files", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    const manifest = JSON.parse(await fs.readFile("openclaw.plugin.json", "utf8"));
    const files = await npmPackDryRunFiles();

    assert.equal(pkg.license, "AGPL-3.0-or-later");
    assert.match(
      await fs.readFile("LICENSE", "utf8"),
      /GNU AFFERO GENERAL PUBLIC LICENSE/,
    );
    assert.match(await fs.readFile("miniclaw/LICENSE.txt", "utf8"), /AGPL-3\.0-or-later/);

    for (const extension of pkg.openclaw.extensions) {
      assert.equal(files.has(extension.replace(/^\.\//, "")), true);
    }

    assert.deepEqual(manifest.skills, ["./skills"]);
    assert.equal(Object.hasOwn(manifest.configSchema.properties, "cliPath"), false);
    assert.equal(files.has("skills/kleinanzeigen-helper-skill/SKILL.md"), true);
  });

  it("keeps manifest tool contracts aligned with registered tools", async () => {
    const manifest = JSON.parse(await fs.readFile("openclaw.plugin.json", "utf8"));
    const toolNames = createKleinanzeigenTools().map((tool) => tool.name);

    assert.deepEqual(manifest.contracts.tools, toolNames);
  });
});
