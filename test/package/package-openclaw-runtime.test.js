import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import {
  execFileAsync,
  linkRuntimeDependencies,
} from "../../test-support/package/package-boundary-fixture.js";

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

async function importEntrypoint(entryPath) {
  const entryUrl = pathToFileURL(entryPath);
  entryUrl.search = `v=${Date.now()}-${Math.random()}`;
  return await import(entryUrl.href);
}

describe("packaged OpenClaw runtime", () => {
  it("imports the root OpenClaw entrypoint with an SDK peer", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-entry-"));

    try {
      await fs.writeFile(
        path.join(tmp, "package.json"),
        JSON.stringify({ type: "module" }),
        "utf8",
      );
      await fs.copyFile("index.js", path.join(tmp, "index.js"));
      await fs.cp("dist", path.join(tmp, "dist"), { recursive: true });
      await fs.symlink(
        path.join(process.cwd(), "miniclaw"),
        path.join(tmp, "miniclaw"),
        "dir",
      );
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

      const imported = await importEntrypoint(
        path.join(packageRoot, "index.js"),
      );
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
          return {
            code: 0,
            signal: null,
            stdout: result.stdout,
            stderr: result.stderr,
          };
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
      assert.equal(files.has("dist/plugin-entry.js"), true);
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
      assert.equal(verifyPayload.stdout, "");
      assert.equal(verifyPayload.needsUserAction, false);
      assert.doesNotMatch(verifyResult.content[0].text, new RegExp(tmp));
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });
});
