import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBrowserDiagnosticReport,
  getChromeVersionDiagnosticInfo,
  normalizeBrowserName,
  parseVersionString,
  validateChrome136Configuration,
} from "../../miniclaw/dist/browser/browser-chrome-diagnostics.js";
import { Config } from "../../miniclaw/dist/model/config-model.js";

describe("miniclaw browser diagnostics", () => {
  it("validates browser version strings and Chrome 136 user-data-dir rules", () => {
    assert.equal(parseVersionString("Google Chrome 136.0.7103.92"), 136);
    assert.equal(normalizeBrowserName("/Applications/Microsoft Edge.app/msedge"), "Edge");
    assert.equal(normalizeBrowserName("/usr/bin/chromium"), "Chromium");

    const [invalid, message] = validateChrome136Configuration(
      ["--remote-debugging-port=9222"],
      "",
    );
    assert.equal(invalid, false);
    assert.match(message, /requires --user-data-dir/);

    const [valid] = validateChrome136Configuration(
      ["--remote-debugging-port=9222", "--user-data-dir=/tmp/profile"],
      "",
    );
    assert.equal(valid, true);
  });

  it("builds browser-free diagnostics for missing binaries and remote debugging", () => {
    const config = new Config({
      browser: {
        binaryLocation: "/missing/chromium",
        arguments: ["--remote-debugging-port=9333"],
        userDataDir: "",
      },
    });

    const report = buildBrowserDiagnosticReport(config);
    const messages = report.lines.map((line) => `${line.status}: ${line.message}`);

    assert.equal(report.remoteDebuggingPort, 9333);
    assert.equal(report.liveProbesSkipped, true);
    assert.match(messages.join("\n"), /fail: Browser binary not found: \/missing\/chromium/);
    assert.match(messages.join("\n"), /fail: Chrome 136\+ configuration validation failed/);
    assert.match(messages.join("\n"), /Browser process inspection skipped/);
  });

  it("extracts remote Chrome version diagnostics without launching a browser", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.equal(String(url), "http://127.0.0.1:9444/json/version");
      return {
        ok: true,
        async json() {
          return {
            Browser: "Chrome/136.0.7103.92",
            "User-Agent": "Mozilla/5.0 Chrome/136.0.7103.92 Safari/537.36",
          };
        },
      };
    };

    try {
      const info = await getChromeVersionDiagnosticInfo({
        remotePort: 9444,
        remoteTimeout: 1,
      });

      assert.deepEqual(info.remote_detection, {
        version_string: "136.0.7103.92",
        major_version: 136,
        browser_name: "Chrome",
        is_chrome_136_plus: true,
      });
      assert.equal(info.chrome_136_plus_detected, true);
      assert.deepEqual(info.recommendations, [
        "Chrome 136+ detected - ensure --user-data-dir is configured for remote debugging",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
