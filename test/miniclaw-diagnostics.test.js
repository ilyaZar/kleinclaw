import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Config } from "../miniclaw/dist/model/config-model.js";
import {
  createLoginDiagnosticsCapture,
  createPublishDiagnosticsCapture,
} from "../miniclaw/dist/publish-side-effects/factory-support.js";

describe("miniclaw diagnostics", () => {
  it("keeps login diagnostics disabled by default", () => {
    const capture = createLoginDiagnosticsCapture(
      new Config({}),
      {
        controller: {
          page: {
            url: "https://login.kleinanzeigen.de/u/login",
          },
        },
        now: () => new Date("2026-06-13T12:00:00Z"),
      },
    );

    assert.equal(capture, undefined);
  });

  it("captures enabled login diagnostics as sensitive local artifacts", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-diagnostics-"));
    const outputDir = path.join(tmp, "diagnostics");
    const logFilePath = path.join(tmp, "runtime.log");
    await fs.mkdir(outputDir);
    await fs.writeFile(logFilePath, "login page local runtime context\n", "utf8");
    let screenshotPath = "";
    const capture = createLoginDiagnosticsCapture(
      new Config({
        diagnostics: {
          captureOn: { loginDetection: true },
          captureLogCopy: true,
          outputDir,
        },
      }),
      {
        controller: {
          page: {
            url: "https://login.kleinanzeigen.de/u/login/password",
            async content() {
              return "<html>account state</html>";
            },
            async screenshot(options) {
              screenshotPath = options.path;
              await fs.writeFile(options.path, "png", "utf8");
            },
          },
        },
        logFilePath,
        now: () => new Date("2026-06-13T12:00:00Z"),
      },
    );

    assert.equal(typeof capture, "function");
    await capture({ basePrefix: "login_detection_password" });

    const files = await fs.readdir(outputDir);
    assert.equal(path.dirname(screenshotPath), outputDir);
    assert.equal(files.filter((file) => file.endsWith(".png")).length, 1);
    assert.equal(files.filter((file) => file.endsWith(".html")).length, 1);
    assert.equal(files.filter((file) => file.endsWith(".log")).length, 1);
    assert.equal(files.filter((file) => file.endsWith(".json")).length, 0);
  });

  it("keeps publish error diagnostics sparse", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-diagnostics-"));
    const error = new Error("publish failed with local state");
    error.stack = "secret stack path";
    let screenshotCalls = 0;
    let contentCalls = 0;
    const capture = createPublishDiagnosticsCapture(
      new Config({
        diagnostics: {
          captureOn: { publish: true },
          outputDir,
        },
      }),
      {
        controller: {
          page: {
            url: "https://www.kleinanzeigen.de/private/path",
            async content() {
              contentCalls += 1;
              return "<html>secret page</html>";
            },
            async screenshot() {
              screenshotCalls += 1;
            },
          },
        },
        now: () => new Date("2026-06-13T12:00:00Z"),
      },
    );

    await capture({
      ad: {
        title: "secret listing title",
      },
      adFile: "/private/workspace/secret-listing/ad.yaml",
      attempt: 2,
      error,
      raw: {
        description: "secret ad description",
      },
    });

    const files = await fs.readdir(outputDir);
    assert.equal(screenshotCalls, 0);
    assert.equal(contentCalls, 0);
    assert.equal(files.length, 1);
    assert.match(files[0], /^publish_error_.*_attempt2\.json$/);

    const payload = JSON.parse(
      await fs.readFile(path.join(outputDir, files[0]), "utf8"),
    );
    assert.deepEqual(payload, {
      attempt: 2,
      exception: {
        message: "publish failed with local state",
        name: "Error",
      },
      timestamp: "2026-06-13T12:00:00",
    });
    assert.doesNotMatch(
      JSON.stringify(payload),
      /secret|private|kleinanzeigen\.de|stack|ad_config|ad_title|ad_file|page_url/,
    );
  });
});
