import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createCommandRunner,
  createKleinClawPluginEntry,
} from "../src/plugin-entry.js";
import {
  buildKleinanzeigenApprovalDescription,
  createKleinanzeigenTools,
  resolveApprovalToolNames,
  SIDE_EFFECT_TOOL_NAMES,
} from "../src/tools.js";
import {
  withMockMiniclawScript,
} from "./helpers/command-runner.js";

describe("kleinanzeigen plugin tools", () => {
  it("registers tools and persists an always-allow choice", async () => {
    const entry = createKleinClawPluginEntry();
    const registeredTools = [];
    const registeredHooks = [];
    const config = {
      plugins: {
        load: { paths: ["/plugin"] },
      },
    };
    const api = {
      pluginConfig: {
        adRoots: ["/ads"],
        approvalMode: "mutating",
      },
      runtime: {
        config: {
          async mutateConfigFile({ mutate }) {
            await mutate(config);
          },
        },
      },
      on(eventName, handler, options) {
        registeredHooks.push({ eventName, handler, options });
      },
      registerTool(tool, options) {
        registeredTools.push({ tool, options });
      },
    };

    entry.register(api);

    assert.equal(entry.id, "kleinclaw");
    assert.equal(registeredTools.length, 16);
    assert.deepEqual(
      registeredTools.map(({ tool }) => tool.name),
      createKleinanzeigenTools().map((tool) => tool.name),
    );
    for (const { options } of registeredTools) {
      assert.equal(options, undefined);
    }

    assert.equal(registeredHooks.length, 1);
    assert.equal(registeredHooks[0].eventName, "before_tool_call");
    assert.deepEqual(registeredHooks[0].options, { priority: 80, timeoutMs: 5000 });

    const beforeToolCall = registeredHooks[0].handler;
    const statusApproval = beforeToolCall({
      params: {},
      toolName: "kleinanzeigen_status",
    });
    assert.equal(statusApproval, undefined);

    const publishApproval = beforeToolCall({
      params: {
        adDirectories: Array.from(
          { length: 20 },
          (_, index) => `/ads/drafts/item-${index}`,
        ),
        confirm: true,
        keepOld: true,
        selector: "all",
      },
      toolName: "kleinanzeigen_publish",
    });
    assert.equal(
      publishApproval.requireApproval.title,
      "Run Kleinanzeigen local operation",
    );
    assert.match(
      publishApproval.requireApproval.description,
      /Ad paths \(20\): drafts\/item-0/,
    );
    assert.match(publishApproval.requireApproval.description, /Keep old ads: true/);
    assert.match(publishApproval.requireApproval.description, /Selector: all/);
    assert.ok(publishApproval.requireApproval.description.length <= 256);
    assert.equal(publishApproval.requireApproval.severity, "warning");
    await publishApproval.requireApproval.onResolution("allow-once");
    assert.equal(config.plugins.entries, undefined);

    await publishApproval.requireApproval.onResolution("allow-always");
    assert.equal(config.plugins.entries.kleinclaw.config.approvalMode, "none");
    assert.deepEqual(config.plugins.load.paths, ["/plugin"]);
    assert.equal(
      beforeToolCall({
        params: { confirm: true, selector: "all" },
        toolName: "kleinanzeigen_publish",
      }),
      undefined,
    );
  });

  it("wraps the OpenClaw runtime command runner for tools", async () => {
    const calls = [];
    const runner = createCommandRunner({
      system: {
        runCommandWithTimeout: async (argv, options) => {
          calls.push({ argv, options });
          return { code: 0, stdout: "ok\n", stderr: "" };
        },
      },
    });

    const result = await runner(["node", "script.js"], {
      cwd: "/work",
      env: { LANG: "C" },
      timeoutMs: 42,
    });

    assert.deepEqual(calls, [
      {
        argv: ["node", "script.js"],
        options: {
          cwd: "/work",
          env: { LANG: "C" },
          timeoutMs: 42,
        },
      },
    ]);
    assert.deepEqual(result, { code: 0, stdout: "ok\n", stderr: "" });
    assert.equal(createCommandRunner({}), undefined);
  });

  it("passes a plugin-scoped sanitized environment to tool commands", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-plugin-env-"));
    const configPath = path.join(tmp, "config.yaml");
    const originalPath = process.env.PATH;
    const originalDisplay = process.env.DISPLAY;
    const originalToken = process.env.SERVICE_API_TOKEN;
    const calls = [];

    try {
      await fs.writeFile(configPath, "ad_files: []\ncategories: {}\n", "utf8");
      process.env.PATH = "/usr/bin";
      process.env.DISPLAY = ":99";
      process.env.SERVICE_API_TOKEN = "do-not-forward";

      const [verify] = createKleinanzeigenTools({
        configPath,
        commandRunner: async (argv, options) => {
          calls.push({ argv, options });
          return { code: 0, stdout: "ok\n", stderr: "" };
        },
      }).filter((tool) => tool.name === "kleinanzeigen_verify");

      const result = await verify.execute("tool-call", {});
      const payload = JSON.parse(result.content[0].text);

      assert.equal(payload.ok, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].options.env.PATH, "/usr/bin");
      assert.equal(calls[0].options.env.DISPLAY, ":99");
      assert.equal(calls[0].options.env.SERVICE_API_TOKEN, undefined);
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalDisplay === undefined) {
        delete process.env.DISPLAY;
      } else {
        process.env.DISPLAY = originalDisplay;
      }
      if (originalToken === undefined) {
        delete process.env.SERVICE_API_TOKEN;
      } else {
        process.env.SERVICE_API_TOKEN = originalToken;
      }
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("reports an empty adRoots gate without hiding the listing tool", async () => {
    const listAds = createKleinanzeigenTools({ adRoots: [] }).find(
      (tool) => tool.name === "kleinanzeigen_list_ads",
    );

    const result = await listAds.execute("list-ads-disabled", {});
    const payload = JSON.parse(result.content[0].text);

    assert.equal(payload.ok, false);
    assert.equal(payload.operation, "list_ads");
    assert.match(payload.stderr, /adRoots must not be empty/);
  });

  it("keeps side-effect tools separate while approval gating local CLI tools", () => {
    const tools = createKleinanzeigenTools();
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_verify"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_status"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_ad_schema"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_read_ad"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_images_list"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_browser_status"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_browser_check"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_browser_configure"), true);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_draft_ad"), true);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_set_ad_active"), true);
    assert.equal(tools.length, 16);
    assert.deepEqual(
      tools.filter((tool) => SIDE_EFFECT_TOOL_NAMES.has(tool.name)).map((tool) => tool.name),
      [
        "kleinanzeigen_browser_configure",
        "kleinanzeigen_draft_ad",
        "kleinanzeigen_set_ad_active",
        "kleinanzeigen_publish",
        "kleinanzeigen_update",
        "kleinanzeigen_delete",
        "kleinanzeigen_download",
        "kleinanzeigen_extend",
      ],
    );
    assert.deepEqual(resolveApprovalToolNames(tools), new Set(tools.map((tool) => tool.name)));
    assert.deepEqual(
      [...resolveApprovalToolNames(tools, { approvalMode: "mutating" })],
      [...SIDE_EFFECT_TOOL_NAMES],
    );
    assert.deepEqual(
      [...resolveApprovalToolNames(tools, { approvalMode: "none" })],
      [],
    );
  });

  it("summarizes approval requests without leaking absolute ad roots", () => {
    const description = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_read_ad",
      params: {
        includeContact: true,
        adConfigPaths: ["/outside/private/ad.yaml"],
      },
      config: {
        adRoots: ["/ads"],
      },
    });

    assert.match(description, /Always allow/);
    assert.match(description, /Operation: read_ad/);
    assert.match(description, /Include contact: true/);
    assert.match(description, /Ad paths \(1\): \[redacted-path\]\/ad.yaml/);
    assert.doesNotMatch(description, /\/ads|\/outside\/private/);

    const imagesDescription = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_images_list",
      params: { directory: "/ads/drafts/sample-listing" },
      config: { adRoots: ["/ads"] },
    });
    assert.match(imagesDescription, /Directory: drafts\/sample-listing/);

    const defaultDescription = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_update",
      params: { selector: "changed" },
    });
    assert.match(defaultDescription, /Scope: miniclaw config default selection/);
  });

  it("summarizes browser checks without leaking profile paths", () => {
    const description = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_browser_check",
      params: {
        browser: "chromium",
        binaryLocation: "/private/browser/chromium",
        usePrivateWindow: false,
        profileMode: "system-default",
        userDataDir: "/private/browser/profile",
        profileName: "Default",
        allowUnsupportedBrowser: true,
      },
      config: {},
    });

    assert.ok(description.length <= 256);
    assert.match(description, /Operation: browser_check/);
    assert.match(description, /Browser: browser=chromium/);
    assert.match(description, /private=false/);
    assert.match(description, /mode=system-default/);
    assert.match(description, /unsupported=true/);
    assert.match(description, /profile=Default/);
    assert.match(description, /Binary: \[redacted-path\]/);
    assert.match(description, /Data dir: \[redacted-path\]/);
    assert.doesNotMatch(description, /\/private/);
  });

  it("summarizes draft writes without leaking absolute ad roots", () => {
    const description = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_draft_ad",
      params: {
        confirm: true,
        directory: "/ads/drafts/sample-listing",
        fileName: "ad.yaml",
        title: "Sample Listing Audio",
        category: "Elektronik > Audio",
        active: false,
        overwrite: false,
      },
      config: {
        adRoots: ["/ads"],
      },
    });

    assert.ok(description.length <= 256);
    assert.match(description, /Operation: draft_ad/);
    assert.match(description, /Directory: drafts\/sample-listing/);
    assert.match(description, /Title: Sample Listing Audio/);
    assert.match(description, /Active: false/);
    assert.doesNotMatch(description, /\/ads/);
  });

  it("summarizes active flag changes without leaking absolute ad roots", () => {
    const description = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_set_ad_active",
      params: {
        confirm: true,
        adDirectories: ["/ads/drafts/lamp"],
        active: true,
      },
      config: {
        adRoots: ["/ads"],
      },
    });

    assert.match(description, /Operation: set_ad_active/);
    assert.match(description, /Ad paths \(1\): drafts\/lamp/);
    assert.match(description, /Active: true/);
    assert.doesNotMatch(description, /\/ads/);
  });

  it("runs a mock CLI and returns sanitized output", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-test-"));
    const mockCli = path.join(tmp, "mock-cli.mjs");
    const mockConfig = path.join(tmp, "config.yaml");
    await fs.writeFile(mockConfig, "not read by the plugin\n", "utf8");
    await fs.writeFile(
      mockCli,
      [
        "#!/usr/bin/env node",
        "console.log(process.argv.slice(2).join(' '));",
        `console.log('using ${mockConfig}');`,
        "console.error('password: should-not-leak');",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(mockCli, 0o700);

    const verify = createKleinanzeigenTools(withMockMiniclawScript(mockCli, {
      workingDirectory: tmp,
      configPath: mockConfig,
      maxOutputChars: 1000,
    })).find((tool) => tool.name === "kleinanzeigen_verify");

    const result = await verify.execute("tool-call", {});
    const payload = JSON.parse(result.content[0].text);

    assert.equal(payload.ok, true);
    assert.deepEqual(payload.command.args, [
      "--config=[redacted]",
      "--logfile=",
      "--workspace-mode=portable",
      "verify",
    ]);
    assert.match(payload.stdout, /using \[redacted-path\]/);
    assert.equal(payload.stderr, "[redacted sensitive line]");
    assert.doesNotMatch(result.content[0].text, /should-not-leak|private\/config/);
  });
});
