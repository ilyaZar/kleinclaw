import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  APPROVAL_TOOL_NAMES,
  buildKleinanzeigenApprovalDescription,
  createKleinanzeigenTools,
  OPTIONAL_TOOL_NAMES,
  resolveApprovalToolNames,
  SIDE_EFFECT_TOOL_NAMES,
} from "../src/tools.js";
import { createNodeCommandRunner } from "./helpers/command-runner.js";

describe("kleinanzeigen plugin tools", () => {
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
    assert.deepEqual([...resolveApprovalToolNames({ approvalMode: "none" })], []);
  });

  it("summarizes approval requests without leaking absolute ad roots", () => {
    const description = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_publish",
      params: {
        confirm: true,
        selector: "all",
        adDirectories: ["/ads/ONGOING/boxen"],
        adConfigPaths: ["/outside/private/ad.yaml"],
      },
      config: {
        adRoots: ["/ads"],
      },
    });

    assert.match(description, /Operation: publish/);
    assert.match(description, /Selector: all/);
    assert.match(description, /Ad directories: ONGOING\/boxen/);
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
        profileMode: "custom",
        userDataDir: "/private/profile",
        profileName: "Default",
        allowUnsupportedBrowser: false,
      },
      config: {},
    });

    assert.match(description, /Operation: browser_configure/);
    assert.match(description, /Browser: chromium/);
    assert.match(description, /Private window: false/);
    assert.match(description, /Profile mode: custom/);
    assert.match(description, /User data dir: \[redacted-path\]\/profile/);
    assert.match(description, /Profile name: Default/);
    assert.match(description, /Allow unsupported browser: false/);
    assert.doesNotMatch(description, /\/private/);
  });

  it("summarizes draft writes without leaking absolute ad roots", () => {
    const description = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_draft_ad",
      params: {
        confirm: true,
        directory: "/ads/ONGOING/boxen",
        fileName: "ad.yaml",
        title: "Boxen von Kenwood",
        category: "Elektronik > Audio",
        active: false,
        overwrite: false,
      },
      config: {
        adRoots: ["/ads"],
      },
    });

    assert.match(description, /Operation: draft_ad/);
    assert.match(description, /Draft directory: ONGOING\/boxen/);
    assert.match(description, /Title: Boxen von Kenwood/);
    assert.match(description, /Active: false/);
    assert.doesNotMatch(description, /\/ads/);
  });

  it("summarizes active flag changes without leaking absolute ad roots", () => {
    const description = buildKleinanzeigenApprovalDescription({
      toolName: "kleinanzeigen_set_ad_active",
      params: {
        confirm: true,
        adDirectories: ["/ads/ONGOING/lamp"],
        active: true,
      },
      config: {
        adRoots: ["/ads"],
      },
    });

    assert.match(description, /Operation: set_ad_active/);
    assert.match(description, /Ad directories: ONGOING\/lamp/);
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

    const verify = createKleinanzeigenTools({
      cliPath: mockCli,
      workingDirectory: tmp,
      configPath: mockConfig,
      maxOutputChars: 1000,
      commandRunner: createNodeCommandRunner(),
    }).find((tool) => tool.name === "kleinanzeigen_verify");

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
