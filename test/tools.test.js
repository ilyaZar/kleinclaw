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
  APPROVAL_TOOL_NAMES,
  buildKleinanzeigenApprovalDescription,
  createKleinanzeigenTools,
  OPTIONAL_TOOL_NAMES,
  resolveApprovalToolNames,
  SIDE_EFFECT_TOOL_NAMES,
} from "../src/tools.js";
import {
  withMockMiniclawScript,
} from "./helpers/command-runner.js";

describe("kleinanzeigen plugin tools", () => {
  it("registers the OpenClaw plugin entry without live side effects", () => {
    const entry = createKleinClawPluginEntry();
    const registeredTools = [];
    const registeredHooks = [];
    const api = {
      pluginConfig: {
        adRoots: ["/ads"],
        approvalMode: "mutating",
      },
      runtime: {},
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
    assert.equal(
      registeredTools.find(({ tool }) => tool.name === "kleinanzeigen_status")
        ?.options?.optional,
      true,
    );
    for (const { tool, options } of registeredTools) {
      assert.equal(
        Boolean(options?.optional),
        OPTIONAL_TOOL_NAMES.has(tool.name),
        `${tool.name} optional registration should match OPTIONAL_TOOL_NAMES`,
      );
    }

    assert.equal(registeredHooks.length, 1);
    assert.equal(registeredHooks[0].eventName, "before_tool_call");
    assert.deepEqual(registeredHooks[0].options, { priority: 80, timeoutMs: 5000 });

    const statusApproval = registeredHooks[0].handler({
      params: {},
      toolName: "kleinanzeigen_status",
    });
    assert.equal(statusApproval, undefined);

    const publishApproval = registeredHooks[0].handler({
      params: {
        adDirectories: ["/ads/drafts/sample-listing"],
        confirm: true,
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
      /Ad directories: drafts\/sample-listing/,
    );
    assert.equal(publishApproval.requireApproval.severity, "warning");
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

  it("keeps mutating tools separate while approval gating local CLI tools", () => {
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
    assert.equal(OPTIONAL_TOOL_NAMES.has("kleinanzeigen_verify"), true);
    assert.equal(OPTIONAL_TOOL_NAMES.has("kleinanzeigen_status"), true);
    assert.equal(OPTIONAL_TOOL_NAMES.has("kleinanzeigen_ad_schema"), true);
    assert.equal(OPTIONAL_TOOL_NAMES.has("kleinanzeigen_read_ad"), true);
    assert.equal(OPTIONAL_TOOL_NAMES.has("kleinanzeigen_images_list"), true);
    assert.equal(OPTIONAL_TOOL_NAMES.has("kleinanzeigen_browser_status"), true);
    assert.equal(OPTIONAL_TOOL_NAMES.has("kleinanzeigen_browser_check"), true);
    assert.equal(APPROVAL_TOOL_NAMES.has("kleinanzeigen_verify"), true);
    assert.equal(APPROVAL_TOOL_NAMES.has("kleinanzeigen_status"), true);
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
    assert.deepEqual([...APPROVAL_TOOL_NAMES], [...OPTIONAL_TOOL_NAMES]);
    assert.deepEqual([...resolveApprovalToolNames()], [...OPTIONAL_TOOL_NAMES]);
    assert.deepEqual(
      [...resolveApprovalToolNames({ approvalMode: "mutating" })],
      [...SIDE_EFFECT_TOOL_NAMES],
    );
    assert.deepEqual(
      [...resolveApprovalToolNames({ approvalMode: "none" })],
      [...OPTIONAL_TOOL_NAMES],
    );
  });

  it("summarizes approval requests without leaking absolute ad roots", () => {
    const description = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_publish",
      params: {
        confirm: true,
        selector: "all",
        adDirectories: ["/ads/drafts/sample-listing"],
        adConfigPaths: ["/outside/private/ad.yaml"],
      },
      config: {
        adRoots: ["/ads"],
      },
    });

    assert.match(description, /Operation: publish/);
    assert.match(description, /Selector: all/);
    assert.match(description, /Ad directories: drafts\/sample-listing/);
    assert.match(description, /Ad config files: \[redacted-path\]\/ad.yaml/);
    assert.match(description, /Confirm: true/);
    assert.doesNotMatch(description, /\/ads|\/outside\/private/);
  });

  it("summarizes browser config changes without leaking profile paths", () => {
    const description = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_browser_configure",
      params: {
        confirm: true,
        browser: "chromium",
        usePrivateWindow: false,
        profileMode: "system-default",
        profileName: "Default",
      },
      config: {},
    });

    assert.match(description, /Operation: browser_configure/);
    assert.match(description, /Browser: chromium/);
    assert.match(description, /Private window: false/);
    assert.match(description, /Profile mode: system-default/);
    assert.match(description, /Profile name: Default/);
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

    assert.match(description, /Operation: draft_ad/);
    assert.match(description, /Draft directory: drafts\/sample-listing/);
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
    assert.match(description, /Ad directories: drafts\/lamp/);
    assert.match(description, /Active: true/);
    assert.match(description, /Confirm: true/);
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
