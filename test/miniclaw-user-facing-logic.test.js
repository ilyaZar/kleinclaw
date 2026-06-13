import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildBrowserDiagnosticReport,
  getChromeVersionDiagnosticInfo,
  normalizeBrowserName,
  parseVersionString,
  validateChrome136Configuration,
} from "../miniclaw/dist/browser/chrome-diagnostics.js";
import { Config } from "../miniclaw/dist/model/config-model.js";
import {
  AdUpdateStrategy,
  applyAutoPriceReduction,
  calculateAutoPriceWithTrace,
  evaluateAutoPriceReduction,
} from "../miniclaw/dist/model/price-reduction.js";
import { contentHashForAd } from "../miniclaw/dist/model/content-hash.js";
import {
  fetchPublishedAds,
  PublishedAdsFetchIncompleteError,
} from "../miniclaw/dist/published-ads.js";
import {
  inspectLocalUpdateCheck,
  parseDurationSeconds,
  UpdateCheckState,
} from "../miniclaw/dist/update-check.js";
import {
  resolveWorkspace,
} from "../miniclaw/dist/workspace.js";

describe("miniclaw price reduction", () => {
  const percentageReduction = {
    enabled: true,
    strategy: "PERCENTAGE",
    amount: 12.5,
    minPrice: 70,
    delayReposts: 0,
    delayDays: 0,
    onUpdate: false,
  };

  it("rounds percentage reductions and applies the configured floor", () => {
    const trace = calculateAutoPriceWithTrace({
      basePrice: 100,
      autoPriceReduction: percentageReduction,
      targetReductionCycle: 3,
    });

    assert.equal(trace.price, 70);
    assert.equal(trace.floor?.toNumber(), 70);
    assert.deepEqual(
      trace.steps.map((step) => ({
        cycle: step.cycle,
        before: step.priceBefore.toNumber(),
        reduction: step.reductionValue.toNumber(),
        after: step.priceAfterRounding.toNumber(),
        floorApplied: step.floorApplied,
      })),
      [
        { cycle: 1, before: 100, reduction: 12.5, after: 88, floorApplied: false },
        { cycle: 2, before: 88, reduction: 11, after: 77, floorApplied: false },
        { cycle: 3, before: 77, reduction: 9.625, after: 70, floorApplied: true },
      ],
    );
  });

  it("keeps publish reductions behind repost and day delays", () => {
    const ad = {
      price: 100,
      repostCount: 3,
      priceReductionCount: 0,
      updatedOn: "2026-01-01T00:00:00Z",
      autoPriceReduction: {
        enabled: true,
        strategy: "FIXED",
        amount: 10,
        minPrice: 50,
        delayReposts: 2,
        delayDays: 3,
        onUpdate: true,
      },
    };

    const tooEarly = evaluateAutoPriceReduction(ad, {
      mode: AdUpdateStrategy.Replace,
      now: new Date("2026-01-02T00:00:00Z"),
    });
    assert.equal(tooEarly.reason, "day_delay_waiting");
    assert.equal(tooEarly.resultPrice, 100);
    assert.equal(tooEarly.elapsedDays, 1);

    const ready = applyAutoPriceReduction(ad, {
      mode: AdUpdateStrategy.Replace,
      now: new Date("2026-01-05T00:00:00Z"),
    });
    assert.equal(ready.reason, "eligible");
    assert.equal(ready.resultPrice, 90);
    assert.equal(ready.nextCycle, 1);
    assert.equal(ad.price, 90);
    assert.equal(ad.priceReductionCount, 1);
    assert.equal(ad.price_reduction_count, 1);
  });

  it("does not let update mode reduce prices unless on-update is enabled", () => {
    const disabled = evaluateAutoPriceReduction({
      price: 100,
      repostCount: 99,
      autoPriceReduction: {
        enabled: true,
        strategy: "FIXED",
        amount: 10,
        minPrice: 20,
        delayReposts: 99,
        delayDays: 0,
        onUpdate: false,
      },
    }, { mode: AdUpdateStrategy.Modify });

    assert.equal(disabled.reason, "update_disabled");
    assert.equal(disabled.resultPrice, 100);

    const enabled = evaluateAutoPriceReduction({
      price: 100,
      repostCount: 1,
      autoPriceReduction: {
        enabled: true,
        strategy: "FIXED",
        amount: 10,
        minPrice: 20,
        delayReposts: 99,
        delayDays: 0,
        onUpdate: true,
      },
    }, { mode: AdUpdateStrategy.Modify });

    assert.equal(enabled.reason, "eligible");
    assert.equal(enabled.delayRepostsIgnored, true);
    assert.equal(enabled.resultPrice, 90);
  });
});

describe("miniclaw config defaults", () => {
  it("exposes request and image download timeout defaults", () => {
    const config = new Config();

    assert.equal(config.timeouts.imageDownload, 60);
    assert.equal(config.timeouts.webRequest, 60);

    const overridden = new Config({
      timeouts: {
        image_download: 61,
        web_request: 62,
      },
    });

    assert.equal(overridden.timeouts.imageDownload, 61);
    assert.equal(overridden.timeouts.webRequest, 62);
  });
});

describe("miniclaw workspace resolution", () => {
  function workspaceArgs(overrides = {}) {
    return {
      configArg: null,
      logfileArg: null,
      workspaceMode: null,
      logfileExplicitlyProvided: false,
      logBasename: "miniclaw",
      stdinIsTTY: false,
      ...overrides,
    };
  }

  it("requires an explicit mode when a config path has no workspace footprint", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-workspace-"));

    assert.throws(
      () => resolveWorkspace(workspaceArgs({
        cwd: tmp,
        env: {},
        configArg: "custom/config.yaml",
      })),
      /Cannot determine workspace mode[\s\S]*Detected neither portable nor XDG footprints/,
    );
  });

  it("reports both portable and XDG footprints when config mode is ambiguous", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-workspace-"));
    const home = path.join(tmp, "home");
    const xdgConfig = path.join(home, ".config", "miniclaw");
    await fs.mkdir(path.join(tmp, ".temp"), { recursive: true });
    await fs.writeFile(path.join(tmp, "config.yaml"), "ad_files: []\n", "utf8");
    await fs.mkdir(xdgConfig, { recursive: true });
    await fs.writeFile(path.join(xdgConfig, "config.yaml"), "ad_files: []\n", "utf8");

    assert.throws(
      () => resolveWorkspace(workspaceArgs({
        cwd: tmp,
        env: {},
        homeDir: home,
        configArg: "config.yaml",
      })),
      /Detected both portable and XDG footprints[\s\S]*Portable footprint hits[\s\S]*XDG footprint hits/,
    );
  });

  it("keeps XDG state/cache separate when a config override is provided", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-workspace-"));
    const home = path.join(tmp, "home");
    const workspace = resolveWorkspace(workspaceArgs({
      cwd: tmp,
      env: {},
      homeDir: home,
      configArg: "custom/config.yaml",
      workspaceMode: "xdg",
      logfileArg: "",
      logfileExplicitlyProvided: true,
    }));

    assert.equal(workspace.mode, "xdg");
    assert.equal(workspace.configFile, path.join(tmp, "custom", "config.yaml"));
    assert.equal(workspace.configDir, path.join(home, ".config", "miniclaw"));
    assert.equal(workspace.stateDir, path.join(home, ".local", "state", "miniclaw"));
    assert.equal(workspace.browserProfileDir, path.join(home, ".cache", "miniclaw", "browser-profile"));
    assert.equal(workspace.logFile, null);
  });
});

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

describe("miniclaw published ads fetch", () => {
  it("fetches paginated ad JSON with Python-shaped response content", async () => {
    const requestedUrls = [];
    const pages = new Map([
      [1, {
        ads: [{ id: 101, state: "ACTIVE", title: "first" }],
        paging: { pageNum: "1", last: "2", next: "2" },
      }],
      [2, {
        ads: [{ id: 202, state: "INACTIVE", title: "second" }],
        paging: { pageNum: 2, last: 2 },
      }],
    ]);

    const ads = await fetchPublishedAds(async (url) => {
      requestedUrls.push(url);
      const page = Number(new URL(url).searchParams.get("pageNum"));
      const content = JSON.stringify(pages.get(page));
      return { content: Buffer.from(content, "utf8") };
    }, { rootUrl: "https://example.invalid" });

    assert.deepEqual(requestedUrls, [
      "https://example.invalid/m-meine-anzeigen-verwalten.json?sort=DEFAULT&pageNum=1",
      "https://example.invalid/m-meine-anzeigen-verwalten.json?sort=DEFAULT&pageNum=2",
    ]);
    assert.deepEqual(ads.map((ad) => ad.id), [101, 202]);
  });

  it("fails closed in strict mode when pagination payloads are malformed", async () => {
    await assert.rejects(
      () => fetchPublishedAds(async () => ({
        content: JSON.stringify({
          ads: [{ id: 101, state: "ACTIVE" }, "not-an-ad"],
          paging: { pageNum: 1, last: 1 },
        }),
      }), { strict: true }),
      (error) => {
        assert.equal(error instanceof PublishedAdsFetchIncompleteError, true);
        assert.match(error.message, /Filtered 1 malformed ad entries/);
        return true;
      },
    );
  });

  it("uses max-page limits as a strict infinite-loop guard", async () => {
    let page = 0;
    await assert.rejects(
      () => fetchPublishedAds(async () => {
        page += 1;
        return {
          content: JSON.stringify({
            ads: [{ id: page, state: "ACTIVE" }],
            paging: { pageNum: page, next: page + 1 },
          }),
        };
      }, { strict: true, maxPageLimit: 2 }),
      /Stopping pagination after 2 pages/,
    );
  });
});

describe("miniclaw content hashes", () => {
  it("ignores metadata while hashing user-visible listing content", () => {
    const base = {
      id: 101,
      title: "Kompaktlautsprecher",
      description: "Guter Zustand",
      price: 25,
      shipping_costs: "4.50",
      auto_price_reduction: {
        enabled: true,
        strategy: "FIXED",
        amount: "2",
        min_price: "15",
        delay_reposts: 1,
        delay_days: 0,
        on_update: true,
      },
      created_on: "2026-01-01T00:00:00Z",
      updated_on: "2026-01-02T00:00:00Z",
      content_hash: "old",
      repost_count: 7,
      price_reduction_count: 2,
    };

    const sameContent = {
      ...base,
      id: 999,
      shipping_costs: 4.5,
      created_on: "2027-01-01T00:00:00Z",
      updated_on: "2027-01-02T00:00:00Z",
      content_hash: "new",
      repost_count: 0,
      price_reduction_count: 0,
    };
    const changedContent = { ...sameContent, description: "Guter Zustand mit Kabel" };

    assert.equal(contentHashForAd(base), contentHashForAd(sameContent));
    assert.notEqual(contentHashForAd(base), contentHashForAd(changedContent));
  });
});

describe("miniclaw update-check state", () => {
  it("parses compact durations and falls back from unsafe intervals", () => {
    assert.equal(parseDurationSeconds("1d 2h 3m 4s"), 93784);

    const state = new UpdateCheckState({
      last_check: "2026-01-01T00:00:00+00:00",
    });

    assert.equal(
      state.shouldCheck("90d", "latest", new Date("2026-01-08T00:00:01Z")),
      true,
    );
    assert.equal(
      state.shouldCheck("90d", "latest", new Date("2026-01-07T00:00:00Z")),
      false,
    );
    assert.equal(
      state.shouldCheck("0d", "preview", new Date("2026-01-02T00:00:01Z")),
      true,
    );
  });

  it("inspects local update state without performing network checks", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-update-"));
    const stateFile = path.join(tmp, "update_check_state.json");
    await fs.writeFile(
      stateFile,
      JSON.stringify({
        version: 0,
        last_check: "2026-01-01T00:00:00+00:00",
      }),
      "utf8",
    );

    const result = await inspectLocalUpdateCheck({
      config: new Config({
        updateCheck: {
          enabled: true,
          channel: "latest",
          interval: "7d",
        },
      }),
      stateFile,
      now: new Date("2026-01-03T00:00:00Z"),
    });

    assert.equal(result.enabled, true);
    assert.equal(result.shouldCheck, false);
    assert.equal(result.networkSkipped, false);
    assert.equal(result.lastCheck?.toISOString(), "2026-01-01T00:00:00.000Z");
  });
});
