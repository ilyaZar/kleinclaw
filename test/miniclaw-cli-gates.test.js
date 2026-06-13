import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Config } from "../miniclaw/dist/model/config-model.js";
import { parseArgs } from "../miniclaw/dist/cli/parser.js";
import { planCommand } from "../miniclaw/dist/cli/planning.js";
import { runLiveBrowserCommand } from "../miniclaw/dist/cli/live-browser.js";
import { runInjectedPublishUpdateCommand } from "../miniclaw/dist/cli/injected-runners.js";
import { runSideEffectCommand } from "../miniclaw/dist/cli/side-effect-dispatch.js";
import {
  browserCommandMessage,
  deleteDoneMessage,
  downloadDoneMessage,
  extendDoneMessage,
  noAdsMessage,
  sideEffectDoneMessage,
} from "../miniclaw/dist/cli/messages.js";

function parsedArgs(overrides = {}) {
  return {
    command: "publish",
    adsSelector: "all",
    adsSelectorExplicit: true,
    configPath: path.resolve("config.yaml"),
    configArg: null,
    logfilePath: path.resolve("miniclaw.log"),
    logfileExplicitlyProvided: false,
    logfileArg: null,
    workspaceMode: null,
    keepOldAds: false,
    allowLiveBrowser: false,
    verbose: false,
    lang: null,
    ...overrides,
  };
}

async function captureStderr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    const result = await fn();
    return { lines, result };
  } finally {
    console.error = original;
  }
}

async function createListingWorkspace({ active = true, id = null } = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-cli-gates-"));
  const adDir = path.join(tmp, "ads", "listing");
  const configPath = path.join(tmp, "config.yaml");
  await fs.mkdir(adDir, { recursive: true });
  await fs.writeFile(
    configPath,
    [
      "ad_files:",
      "  - ads/**/ad.yaml",
      "categories: {}",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(adDir, "ad.yaml"),
    [
      `active: ${active ? "true" : "false"}`,
      ...(id === null ? [] : [`id: ${id}`]),
      "title: cli gate listing",
      "description: this listing exercises command planning",
      "category: Audio_und_Hifi",
      "price_type: NEGOTIABLE",
      "",
    ].join("\n"),
    "utf8",
  );
  return { configPath, tmp };
}

async function runSignalCleanupSmoke(signal, expectedCode) {
  const { configPath, tmp } = await createListingWorkspace();
  const markerPath = path.join(tmp, `${signal}.closed`);
  const scriptPath = path.join(tmp, "signal-child.mjs");
  const cliModuleUrl = pathToFileURL(
    path.resolve("miniclaw/dist/cli.js"),
  ).href;

  await fs.writeFile(
    scriptPath,
    [
      "import fs from 'node:fs/promises';",
      `const { run } = await import(${JSON.stringify(cliModuleUrl)});`,
      "const [, , configPath, markerPath] = process.argv;",
      "const keepAlive = setInterval(() => {}, 1000);",
      "await run([",
      "  'node',",
      "  'miniclaw',",
      "  '--allow-live-browser',",
      "  '--workspace-mode=portable',",
      "  `--config=${configPath}`,",
      "  'publish',",
      "], {",
      "  createLiveSideEffects: () => ({",
      "    close: async () => {",
      "      clearInterval(keepAlive);",
      "      await fs.writeFile(markerPath, 'closed', 'utf8');",
      "    },",
      "    fetchPublishedAds: async () => {",
      "      console.log('ready');",
      "      return new Promise(() => {});",
      "    },",
      "    publishAd: async () => {},",
      "  }),",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [scriptPath, configPath, markerPath],
        { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      let signaled = false;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`child did not exit after ${signal}: ${stderr}`));
      }, 5000);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
        if (!signaled && stdout.includes("ready")) {
          signaled = true;
          child.kill(signal);
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code, exitSignal) => {
        clearTimeout(timer);
        resolve({ code, signal: exitSignal, stderr, stdout });
      });
    });

    assert.equal(result.code, expectedCode);
    assert.equal(result.signal, null);
    assert.equal(await fs.readFile(markerPath, "utf8"), "closed");
  } finally {
    await fs.rm(tmp, { force: true, recursive: true });
  }
}

describe("miniclaw CLI planning", () => {
  it("plans verify without browser automation and keeps selected ad context", async () => {
    const { configPath, tmp } = await createListingWorkspace();
    try {
      const plan = await planCommand(
        parseArgs(["node", "miniclaw", "--config", configPath, "verify"]),
      );

      assert.equal(plan.command, "verify");
      assert.equal(plan.adsSelector, "all");
      assert.equal(plan.loadAds, true);
      assert.equal(plan.excludeAdsWithId, false);
      assert.equal(plan.needsBrowser, false);
      assert.equal(plan.selectedCount, 1);
      assert.deepEqual(plan.selectedAds, [{
        active: true,
        id: null,
        relativePath: "ads/listing/ad.yaml",
        title: "cli gate listing",
      }]);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("plans download as a browser-gated command without reading local ads", async () => {
    const plan = await planCommand(
      parseArgs(["node", "miniclaw", "download", "--ads", "new"]),
    );

    assert.equal(plan.command, "download");
    assert.equal(plan.adsSelector, "new");
    assert.equal(plan.loadAds, false);
    assert.equal(plan.needsBrowser, true);
    assert.equal(plan.selectedCount, null);
  });
});

describe("miniclaw CLI browser gates", () => {
  it("prints DONE when a side-effect command has no selected ads", async () => {
    const { configPath, tmp } = await createListingWorkspace({ active: false });
    try {
      const { lines, result } = await captureStderr(() =>
        runSideEffectCommand(parsedArgs({
          command: "publish",
          configPath,
        })),
      );

      assert.equal(result, 0);
      assert.match(lines.join("\n"), /DONE: No new\/outdated ads found/);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("refuses browser-backed publish until live browser is explicitly allowed", async () => {
    const { configPath, tmp } = await createListingWorkspace();
    try {
      const { lines, result } = await captureStderr(() =>
        runSideEffectCommand(parsedArgs({
          command: "publish",
          configPath,
        })),
      );

      assert.equal(result, 2);
      assert.match(lines.join("\n"), /publish selected 1 ad/);
      assert.match(lines.join("\n"), /browser automation is gated/);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("rejects unsupported live-browser commands before loading config", async () => {
    const { lines, result } = await captureStderr(() =>
      runLiveBrowserCommand(parsedArgs({
        command: "verify",
        allowLiveBrowser: true,
      })),
    );

    assert.equal(result, 2);
    assert.match(lines.join("\n"), /supported only for publish/);
  });

  it("requires a workspace before download can run through live browser", async () => {
    await assert.rejects(
      () => runLiveBrowserCommand(parsedArgs({
        command: "download",
        allowLiveBrowser: true,
      })),
      /Workspace must be resolved before download/,
    );
  });

  it("closes live side effects when injected download hooks are incomplete", async () => {
    const { configPath, tmp } = await createListingWorkspace();
    let closed = false;
    const workspace = {
      mode: "portable",
      configFile: configPath,
      configDir: tmp,
      logFile: null,
      stateDir: path.join(tmp, ".temp"),
      downloadDir: path.join(tmp, "downloaded-ads"),
      browserProfileDir: path.join(tmp, ".temp", "browser-profile"),
      diagnosticsDir: path.join(tmp, ".temp", "diagnostics"),
    };

    try {
      const { lines, result } = await captureStderr(() =>
        runLiveBrowserCommand(
          parsedArgs({
            command: "download",
            adsSelector: "new",
            configPath,
            allowLiveBrowser: true,
          }),
          () => ({
            close: async () => {
              closed = true;
            },
          }),
          workspace,
        ),
      );

      assert.equal(result, 2);
      assert.equal(closed, true);
      assert.match(lines.join("\n"), /download requires injected fetch/);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("closes live side effects before exiting on SIGINT and SIGTERM", async () => {
    await runSignalCleanupSmoke("SIGINT", 130);
    await runSignalCleanupSmoke("SIGTERM", 143);
  });
});

describe("miniclaw injected command messages", () => {
  it("prints no-ad DONE blocks for injected publish/update commands", async () => {
    const { lines, result } = await captureStderr(() =>
      runInjectedPublishUpdateCommand(
        parsedArgs({ command: "update" }),
        {},
        {
          ads: [],
          config: new Config({ categories: {} }),
        },
      ),
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /DONE: No changed ads found/);
  });

  it("keeps user-visible DONE and browser-gate messages stable", () => {
    assert.equal(noAdsMessage("delete"), "DONE: No ads to delete found.");
    assert.equal(sideEffectDoneMessage("publish", 2, 1), (
      "DONE: (Re-)published 2 ads (1 failed after retries)"
    ));
    assert.equal(deleteDoneMessage(1, 3), "DONE: Deleted 1 of 3 ads");
    assert.equal(extendDoneMessage(0, 0), "DONE: No ads extended.");
    assert.equal(downloadDoneMessage("all", 1, 3), "DONE: Downloaded 1 of 3 ads");
    assert.equal(browserCommandMessage({
      command: "download",
      adsSelector: "new",
      loadAds: false,
      excludeAdsWithId: null,
      selectedCount: null,
      selectedAds: [],
      needsBrowser: true,
      doneMessage: null,
    }), (
      "download requires browser automation; rerun with --allow-live-browser " +
      "after confirming the account side effect."
    ));
  });
});
