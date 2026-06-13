import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";

import { toAd } from "../miniclaw/dist/model/ad-normalization.js";
import { BUILTIN_CATEGORIES } from "../miniclaw/dist/resources/categories.js";
import { createKleinanzeigenTools } from "../src/tools.js";

const execFileAsync = promisify(execFile);
const allowedDependencies = {
  "decimal.js": "^10.6.0",
  glob: "^13.0.6",
  yaml: "^2.9.0",
};
const allowedDevDependencies = {
  "@types/node": "^22.19.21",
  typescript: "^6.0.3",
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
    assert.equal(pkg.scripts?.build, "npm run build:miniclaw");
    assert.equal(pkg.scripts?.["build:miniclaw"], "tsc -p tsconfig.miniclaw.json");
    assert.deepEqual(pkg.dependencies, allowedDependencies);
    assert.deepEqual(pkg.devDependencies, allowedDevDependencies);
  });

  it("keeps the package lock scoped to embedded miniclaw dependencies", async () => {
    const lockText = await fs.readFile("package-lock.json", "utf8");
    const lock = JSON.parse(lockText);

    assert.deepEqual(lock.packages?.[""]?.dependencies, allowedDependencies);
    assert.deepEqual(lock.packages?.[""]?.devDependencies, allowedDevDependencies);
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
      "examples/sample-listing/ad.yaml",
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

  it("ships an inactive miniclaw-shaped example ad", async () => {
    const exampleText = await fs.readFile("examples/sample-listing/ad.yaml", "utf8");
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
    assert.equal(Object.hasOwn(miniclawPkg.dependencies, "playwright-core"), false);
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

  it("keeps the browser session planner on miniclaw CDP profile semantics", async () => {
    const {
      browserCandidatePaths,
      buildBrowserSessionPlan,
      getCompatibleBrowser,
    } = await import("../miniclaw/dist/browser/session-plan.js");
    const {
      remoteDebuggingPortFromArguments,
    } = await import("../miniclaw/dist/browser/browser-arguments.js");
    const {
      CdpContext,
      CdpLocator,
      CdpPage,
      launchCdpBrowser,
    } = await import("../miniclaw/dist/browser/cdp-adapter.js");
    const { Config } = await import("../miniclaw/dist/model/config-model.js");
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-cdp-plan-"));
    const fakeBrowser = path.join(tmp, "chromium");
    const workspaceProfile = path.join(tmp, ".temp", "browser-profile");
    const relativeExtension = path.join("extensions", "helper.crx");
    const binA = path.join(tmp, "bin-a");
    const binB = path.join(tmp, "bin-b");
    const detectedChromium = path.join(binB, "chromium");
    const detectedChrome = path.join(binA, "google-chrome");

    await fs.writeFile(fakeBrowser, "#!/bin/sh\nexit 0\n", "utf8");
    await fs.chmod(fakeBrowser, 0o700);
    await fs.mkdir(binA);
    await fs.mkdir(binB);
    await fs.writeFile(detectedChrome, "#!/bin/sh\nexit 0\n", "utf8");
    await fs.writeFile(detectedChromium, "#!/bin/sh\nexit 0\n", "utf8");
    await fs.chmod(detectedChrome, 0o700);
    await fs.chmod(detectedChromium, 0o700);

    assert.equal(
      getCompatibleBrowser({
        platform: "linux",
        searchPath: [binA, binB].join(path.delimiter),
      }),
      detectedChromium,
    );
    assert.deepEqual(
      browserCandidatePaths({
        env: {
          LOCALAPPDATA: "LocalAppData",
          PROGRAMFILES: "ProgramFiles",
          "PROGRAMFILES(X86)": "ProgramFilesX86",
        },
        platform: "win32",
        searchPath: "",
      }).slice(0, 12),
      [
        path.win32.join("LocalAppData", "Google", "Chrome", "Application", "chrome.exe"),
        path.win32.join("ProgramFiles", "Google", "Chrome", "Application", "chrome.exe"),
        path.win32.join("ProgramFilesX86", "Google", "Chrome", "Application", "chrome.exe"),
        path.win32.join("LocalAppData", "Microsoft", "Edge", "Application", "msedge.exe"),
        path.win32.join("ProgramFiles", "Microsoft", "Edge", "Application", "msedge.exe"),
        path.win32.join("ProgramFilesX86", "Microsoft", "Edge", "Application", "msedge.exe"),
        path.win32.join("LocalAppData", "Chromium", "Application", "chrome.exe"),
        path.win32.join("ProgramFiles", "Chromium", "Application", "chrome.exe"),
        path.win32.join("ProgramFilesX86", "Chromium", "Application", "chrome.exe"),
        path.win32.join("ProgramFiles", "Chrome", "Application", "chrome.exe"),
        path.win32.join("ProgramFilesX86", "Chrome", "Application", "chrome.exe"),
        path.win32.join("LocalAppData", "Chrome", "Application", "chrome.exe"),
      ],
    );
    assert.throws(
      () => getCompatibleBrowser({ platform: "plan9", searchPath: "" }),
      /Installed browser for OS plan9 could not be detected/,
    );
    assert.throws(
      () => buildBrowserSessionPlan(
        new Config({
          browser: {
            arguments: ["--remote-debugging-port=9333"],
            binary_location: path.join(tmp, "missing-browser"),
          },
        }),
        { cwd: tmp, defaultUserDataDir: workspaceProfile },
      ),
      /Specified browser binary .*missing-browser.* does not exist/,
    );
    assert.throws(
      () => remoteDebuggingPortFromArguments(["--remote-debugging-port=abc"]),
      /Invalid --remote-debugging-port value: abc/,
    );
    assert.equal(
      remoteDebuggingPortFromArguments(["--remote-debugging-port=0"]),
      null,
    );

    const plan = buildBrowserSessionPlan(
      new Config({
        browser: {
          arguments: ["--disable-dev-shm-usage"],
          binary_location: fakeBrowser,
          extensions: [relativeExtension],
          profile_name: "Profile 1",
          user_data_dir: "",
        },
      }),
      { cwd: tmp, defaultUserDataDir: workspaceProfile },
    );

    assert.equal(plan.mode, "launch");
    assert.equal(plan.browserExecutablePath, fakeBrowser);
    assert.equal(plan.userDataDir, workspaceProfile);
    assert.equal(plan.profileDir, path.join(workspaceProfile, "Profile 1"));
    assert.equal(plan.preferencesFile, path.join(workspaceProfile, "Profile 1", "Preferences"));
    assert.deepEqual(plan.extensionPaths, [path.join(tmp, relativeExtension)]);
    assert.equal(plan.browserArgs.includes("--disable-dev-shm-usage"), true);
    assert.equal(plan.browserArgs.some((arg) => arg.startsWith("--user-data-dir=")), false);
    assert.equal(plan.remotePort, null);

    const remotePlan = buildBrowserSessionPlan(
      new Config({
        browser: {
          arguments: [
            "--remote-debugging-host=127.0.0.1",
            "--remote-debugging-port=9333",
          ],
          binary_location: fakeBrowser,
          extensions: [path.join("extensions", "remote-ignored.crx")],
          profile_name: "Remote Profile",
          user_data_dir: path.join(tmp, "remote-profile"),
        },
      }),
      { cwd: tmp, defaultUserDataDir: workspaceProfile },
    );

    assert.equal(remotePlan.mode, "connect");
    assert.equal(remotePlan.remoteHost, "127.0.0.1");
    assert.equal(remotePlan.remotePort, 9333);
    assert.deepEqual(remotePlan.browserArgs, []);
    assert.equal(remotePlan.userDataDir, null);
    assert.equal(remotePlan.profileDir, null);
    assert.equal(remotePlan.preferencesFile, null);
    assert.deepEqual(remotePlan.extensionPaths, []);

    const disposedInitialPages = [];
    const closedInitialPages = [];
    const existingPage = {
      dispose: async () => disposedInitialPages.push("existing"),
      close: async () => closedInitialPages.push("existing"),
    };
    const context = new CdpContext("http://127.0.0.1:1", 1, null, [existingPage]);

    assert.deepEqual(context.pages(), [existingPage]);
    await context.close();
    assert.deepEqual(disposedInitialPages, ["existing"]);
    assert.deepEqual(closedInitialPages, []);

    const trackedPage = new CdpPage("http://127.0.0.1:1", {
      id: "page-1",
      type: "page",
      url: "about:blank",
      webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/page-1",
    }, 1);
    const handlers = new Map();
    let currentHref = "https://www.kleinanzeigen.de/s-home.html";
    trackedPage.client = {
      close: () => {},
      connect: async () => {},
      on: (method, handler) => {
        handlers.set(method, handler);
        return () => handlers.delete(method);
      },
      send: async (method, params = {}) => {
        if (method === "Runtime.evaluate") {
          const expression = String(params.expression ?? "");
          if (expression === "document.readyState") {
            return { result: { value: "complete" } };
          }
          if (expression === "location.href") {
            return { result: { value: currentHref } };
          }
        }
        return {};
      },
    };

    await trackedPage.init();
    assert.equal(trackedPage.url, "https://www.kleinanzeigen.de/s-home.html");
    handlers.get("Page.frameNavigated")({
      frame: {
        parentId: "main",
        url: "https://www.kleinanzeigen.de/ignored-child-frame",
      },
    });
    assert.equal(trackedPage.url, "https://www.kleinanzeigen.de/s-home.html");
    handlers.get("Page.frameNavigated")({
      frame: { url: "https://login.kleinanzeigen.de/u/login" },
    });
    assert.equal(trackedPage.url, "https://login.kleinanzeigen.de/u/login");
    handlers.get("Page.navigatedWithinDocument")({
      url: "https://login.kleinanzeigen.de/u/login/password",
    });
    assert.equal(trackedPage.url, "https://login.kleinanzeigen.de/u/login/password");
    currentHref = "https://www.kleinanzeigen.de/m-meine-anzeigen.html";
    await trackedPage.waitForLoadState("load");
    assert.equal(trackedPage.url, "https://www.kleinanzeigen.de/m-meine-anzeigen.html");

    const navPage = new CdpPage("http://127.0.0.1:1", {
      id: "page-nav",
      type: "page",
      url: "about:blank",
      webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/page-nav",
    }, 1);
    const navHandlers = new Map();
    const navCalls = [];
    navPage.client = {
      close: () => {},
      connect: async () => {},
      on: (method, handler) => {
        navHandlers.set(method, handler);
        return () => navHandlers.delete(method);
      },
      send: async (method, params = {}) => {
        navCalls.push([method, params]);
        if (method === "Runtime.evaluate") {
          return {
            result: {
              value: "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
            },
          };
        }
        return {};
      },
    };

    const navPromise = navPage.goto(
      "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
      { timeout: 1234 },
    );
    await Promise.resolve();
    assert.deepEqual(navCalls, [
      [
        "Page.navigate",
        { url: "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html" },
      ],
    ]);
    navHandlers.get("Page.frameNavigated")({
      frame: {
        url: "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
      },
    });
    await navPromise;
    assert.equal(
      navPage.url,
      "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
    );
    assert.deepEqual(
      navCalls.map(([method, params]) => [
        method,
        params.expression ?? params.url,
      ]),
      [
        [
          "Page.navigate",
          "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
        ],
        ["Runtime.evaluate", "location.href"],
      ],
    );

    const typedPage = new CdpPage("http://127.0.0.1:1", {
      id: "page-2",
      type: "page",
      url: "about:blank",
      webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/page-2",
    }, 1);
    const dispatchedKeys = [];
    const typedFunctions = [];
    typedPage.client = {
      close: () => {},
      connect: async () => {},
      on: () => () => {},
      send: async (method, params = {}) => {
        if (method === "Runtime.evaluate") {
          return { result: { objectId: "element-1" } };
        }
        if (method === "DOM.describeNode") {
          return { node: { backendNodeId: 123 } };
        }
        if (method === "Runtime.callFunctionOn") {
          typedFunctions.push(params);
          return { result: { value: undefined } };
        }
        if (method === "Input.dispatchKeyEvent") {
          dispatchedKeys.push(params);
        }
        return {};
      },
    };
    const typedLocator = new CdpLocator(typedPage, [
      { kind: "css", value: "#title", index: 0 },
    ]);

    await typedLocator.type("Ab 9!\n");
    assert.equal(typedFunctions.length, 1);
    assert.equal(typedFunctions[0].objectId, "element-1");
    assert.equal(typedFunctions[0].functionDeclaration, "(element) => element.focus()");
    assert.deepEqual(typedFunctions[0].arguments, [{ objectId: "element-1" }]);
    assert.equal(typedFunctions[0].userGesture, true);
    assert.deepEqual(
      dispatchedKeys.map((event) => [
        event.type,
        event.text,
      ]),
      [
        ["char", "A"],
        ["char", "b"],
        ["char", " "],
        ["char", "9"],
        ["char", "!"],
        ["char", "\n"],
      ],
    );

    const textPage = new CdpPage("http://127.0.0.1:1", {
      id: "page-text",
      type: "page",
      url: "about:blank",
      webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/page-text",
    }, 1);
    let fakeDocument;
    const button = {
      id: "button",
      ownerDocument: null,
      querySelectorAll: () => [],
      textContent: "Submit",
    };
    const container = {
      id: "container",
      ownerDocument: null,
      querySelectorAll: () => [button],
      textContent: "Submit Cancel",
    };
    const shell = {
      id: "shell",
      ownerDocument: null,
      querySelectorAll: () => [container, button],
      textContent: "Account Submit Cancel Footer",
    };
    fakeDocument = {
      querySelectorAll: (selector) => {
        assert.equal(selector, "*");
        return [shell, container, button];
      },
    };
    for (const element of [button, container, shell]) {
      element.ownerDocument = fakeDocument;
    }
    const evaluateWithFakeDocument = (expression) => {
      const hadDocument = Object.hasOwn(globalThis, "document");
      const previousDocument = globalThis.document;
      globalThis.document = fakeDocument;
      try {
        return Function(`return (${expression})`)();
      } finally {
        if (hadDocument) {
          globalThis.document = previousDocument;
        } else {
          delete globalThis.document;
        }
      }
    };
    const textLocatorObjects = [];
    textPage.client = {
      close: () => {},
      connect: async () => {},
      on: () => () => {},
      send: async (method, params = {}) => {
        if (method === "Runtime.evaluate") {
          const value = evaluateWithFakeDocument(String(params.expression));
          if (value && typeof value === "object") {
            textLocatorObjects.push(value.id);
            return { result: { objectId: value.id } };
          }
          return { result: { value } };
        }
        if (method === "DOM.describeNode") {
          return { node: { backendNodeId: 789 } };
        }
        if (method === "Runtime.callFunctionOn") {
          assert.equal(params.objectId, "button");
          return { result: { value: { x: 10, y: 20 } } };
        }
        return {};
      },
    };
    const textLocator = textPage.getByText("Submit");

    assert.equal(await textLocator.count(), 3);
    await textLocator.first().click();
    assert.deepEqual(textLocatorObjects, ["button"]);

    const clickedPage = new CdpPage("http://127.0.0.1:1", {
      id: "page-3",
      type: "page",
      url: "about:blank",
      webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/page-3",
    }, 1);
    const clickedFunctions = [];
    clickedPage.client = {
      close: () => {},
      connect: async () => {},
      on: () => () => {},
      send: async (method, params = {}) => {
        if (method === "Runtime.evaluate") {
          return { result: { objectId: "button-1" } };
        }
        if (method === "DOM.describeNode") {
          return { node: { backendNodeId: 456 } };
        }
        if (method === "Runtime.callFunctionOn") {
          clickedFunctions.push(params);
          return { result: { value: undefined } };
        }
        return {};
      },
    };
    const clickedLocator = new CdpLocator(clickedPage, [
      { kind: "css", value: "#submit", index: 0 },
    ]);

    await clickedLocator.click();
    assert.equal(clickedFunctions.length, 1);
    assert.equal(clickedFunctions[0].objectId, "button-1");
    assert.equal(clickedFunctions[0].functionDeclaration, "(el) => el.click()");
    assert.deepEqual(clickedFunctions[0].arguments, [{ objectId: "button-1" }]);
    assert.equal(clickedFunctions[0].userGesture, true);

    const uploadPage = new CdpPage("http://127.0.0.1:1", {
      id: "page-upload",
      type: "page",
      url: "about:blank",
      webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/page-upload",
    }, 1);
    const uploadedFiles = [];
    uploadPage.client = {
      close: () => {},
      connect: async () => {},
      on: () => () => {},
      send: async (method, params = {}) => {
        if (method === "Runtime.evaluate") {
          return { result: { objectId: "file-input-1" } };
        }
        if (method === "DOM.describeNode") {
          return { node: { backendNodeId: 987 } };
        }
        if (method === "DOM.setFileInputFiles") {
          uploadedFiles.push(params);
          return {};
        }
        return {};
      },
    };
    const uploadLocator = new CdpLocator(uploadPage, [
      { kind: "css", value: "input[type=file]", index: 0 },
    ]);
    const uploadFile = path.join(tmp, "photo.jpg");

    await uploadLocator.sendFile(uploadFile);
    assert.deepEqual(uploadedFiles, [{
      backendNodeId: 987,
      files: [uploadFile],
      objectId: "file-input-1",
    }]);

    const evaluatedPage = new CdpPage("http://127.0.0.1:1", {
      id: "page-evaluate",
      type: "page",
      url: "about:blank",
      webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/page-evaluate",
    }, 1);
    const evaluatedExpressions = [];
    evaluatedPage.client = {
      close: () => {},
      connect: async () => {},
      on: () => () => {},
      send: async (method, params = {}) => {
        if (method === "Runtime.evaluate") {
          evaluatedExpressions.push(params);
          return { result: { value: { ok: true } } };
        }
        return {};
      },
    };

    const evaluated = await evaluatedPage.evaluate(
      ({ requestUrl }) => requestUrl,
      {
        requestHeaders: { "x-csrf-token": "token" },
        requestMethod: "POST",
        requestUrl: "/api/delete",
      },
    );
    assert.deepEqual(evaluated, { ok: true });
    assert.equal(evaluatedExpressions.length, 1);
    assert.equal(evaluatedExpressions[0].awaitPromise, true);
    assert.equal(evaluatedExpressions[0].returnByValue, true);
    assert.match(
      evaluatedExpressions[0].expression,
      /^\(\(\{ requestUrl \}\) => requestUrl\)\(/,
    );
    assert.match(evaluatedExpressions[0].expression, /"requestUrl":"\/api\/delete"/);
    assert.match(evaluatedExpressions[0].expression, /"requestMethod":"POST"/);
    assert.match(
      evaluatedExpressions[0].expression,
      /"requestHeaders":\{"x-csrf-token":"token"\}/,
    );

    await assert.rejects(
      () => launchCdpBrowser({
        ...plan,
        extensionPaths: [path.join(tmp, "missing.crx")],
      }),
      /Configured extension-file .*missing\.crx.* does not exist/,
    );
  });

  it("keeps local guidance, tests, coverage, and unused assets out of the package", async () => {
    const files = await npmPackDryRunFiles();
    const forbiddenFiles = [
      "AGENTS.md",
      "lcov.info",
      "package-lock.json",
      "test/cli.test.js",
      "test/tools.test.js",
      "tsconfig.miniclaw.json",
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
    const provenanceOnlyFiles = new Set([
      "CHANGELOG.md",
      "miniclaw/LICENSE.txt",
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
