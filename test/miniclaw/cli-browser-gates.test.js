import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

import {
  IpRangeBlockedError,
  ManualActionRequiredError,
} from "../../miniclaw/dist/auth.js";
import { run } from "../../miniclaw/dist/cli.js";
import {
  runLiveBrowserCommand,
} from "../../miniclaw/dist/cli/cli-live-browser.js";
import {
  runSideEffectCommand,
} from "../../miniclaw/dist/cli/cli-side-effect-dispatch.js";
import {
  captureStderr,
  createListingWorkspace,
  parsedArgs,
} from "../../test-support/miniclaw/cli-gates-fixture.js";

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

  it("stops live commands when Kleinanzeigen blocks the IP range", async () => {
    const { configPath, tmp } = await createListingWorkspace();
    try {
      const { lines, result } = await captureStderr(() =>
        runLiveBrowserCommand(
          parsedArgs({
            command: "publish",
            configPath,
            allowLiveBrowser: true,
          }),
          async () => {
            throw new IpRangeBlockedError();
          },
        ),
      );
      const stderr = lines.join("\n");

      assert.equal(result, 4);
      assert.match(stderr, /temporarily blocked this network or IP range/i);
      assert.match(stderr, /do not retry automatically/i);
      assert.match(stderr, /inform the user and try again later/i);
      assert.doesNotMatch(stderr, /Ref#|IP#|2a01:/i);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("preserves manual-action results when browser cleanup fails", async () => {
    const { configPath, tmp } = await createListingWorkspace();
    try {
      const output = await captureStderr(() =>
        run(
          [
            "node",
            "miniclaw",
            "--output=json",
            "--allow-live-browser",
            "--workspace-mode=portable",
            `--config=${configPath}`,
            "publish",
          ],
          {
            createLiveSideEffects: () => ({
              close: async () => {
                throw new Error("cleanup failed");
              },
              fetchPublishedAds: async () => {
                throw new ManualActionRequiredError(
                  "Manual browser action requires an interactive run.",
                );
              },
              publishAd: async () => {},
            }),
          },
        )
      );
      const payload = JSON.parse(output.stdout[0]);

      assert.equal(output.result, 2);
      assert.equal(payload.status, "failed");
      assert.equal(payload.diagnostics[0].code, "manual_action_required");
      assert.match(output.lines.join("\n"), /cleanup failed/);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
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
