import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildChildEnv,
  buildKleinanzeigenArgs,
  detectUserActionRequest,
  getKleinanzeigenStatus,
  redactArgs,
  runProcess,
  sanitizeText,
} from "../src/cli.js";

describe("kleinanzeigen CLI argument builder", () => {
  it("builds fixed verify args with redacted config args", () => {
    const args = buildKleinanzeigenArgs(
      "verify",
      {},
      {
        configPath: "/secret/config.yaml",
        workspaceMode: "portable",
        lang: "en",
      },
    );

    assert.deepEqual(args, [
      "--config=/secret/config.yaml",
      "--logfile=",
      "--workspace-mode=portable",
      "--lang=en",
      "verify",
    ]);
    assert.deepEqual(redactArgs(args), [
      "--config=[redacted]",
      "--logfile=",
      "--workspace-mode=portable",
      "--lang=en",
      "verify",
    ]);
  });

  it("requires confirmation and numeric ad IDs for delete", () => {
    assert.throws(
      () => buildKleinanzeigenArgs("delete", { adIds: ["123"] }),
      /confirm must be true/,
    );
    assert.throws(
      () =>
        buildKleinanzeigenArgs(
          "delete",
          { confirm: true, adIds: ["123;rm"] },
          { configPath: "config.yaml" },
        ),
      /numeric ad IDs/,
    );

    assert.deepEqual(
      buildKleinanzeigenArgs(
        "delete",
        { confirm: true, adIds: ["123", "456"] },
        { configPath: "config.yaml" },
      ),
      ["--config=config.yaml", "--logfile=", "--workspace-mode=portable", "delete", "--ads=123,456"],
    );
  });

  it("rejects unsupported selectors instead of forwarding arbitrary args", () => {
    assert.throws(
      () =>
        buildKleinanzeigenArgs(
          "publish",
          { confirm: true, selector: "--help" },
          { configPath: "config.yaml" },
        ),
      /selector must be one of/,
    );
    assert.throws(
      () =>
        buildKleinanzeigenArgs(
          "publish",
          { confirm: true, selectors: ["changed", "--help"] },
          { configPath: "config.yaml" },
        ),
      /selectors must contain only/,
    );
  });

  it("supports current update and extend selectors", () => {
    assert.deepEqual(
      buildKleinanzeigenArgs(
        "update",
        { confirm: true, selector: "all" },
        { configPath: "config.yaml" },
      ),
      ["--config=config.yaml", "--logfile=", "--workspace-mode=portable", "update", "--ads=all"],
    );
    assert.throws(
      () =>
        buildKleinanzeigenArgs(
          "publish",
          { confirm: true, adIds: ["123"], selector: "due" },
          { configPath: "config.yaml" },
        ),
      /adIds cannot be combined/,
    );
    assert.deepEqual(
      buildKleinanzeigenArgs(
        "publish",
        { confirm: true, selectors: ["changed", "due", "changed"] },
        { configPath: "config.yaml" },
      ),
      ["--config=config.yaml", "--logfile=", "--workspace-mode=portable", "publish", "--ads=changed,due"],
    );
    assert.deepEqual(
      buildKleinanzeigenArgs(
        "extend",
        { confirm: true },
        { configPath: "config.yaml" },
      ),
      ["--config=config.yaml", "--logfile=", "--workspace-mode=portable", "extend", "--ads=all"],
    );
  });
});

describe("kleinanzeigen CLI status", () => {
  it("checks executable capabilities without reading config contents", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-status-"));
    const mockCli = path.join(tmp, "mock-cli.mjs");
    const mockConfig = path.join(tmp, "config.yaml");
    await fs.writeFile(mockConfig, "password: should-not-be-read\n", "utf8");
    await fs.writeFile(
      mockCli,
      [
        "#!/usr/bin/env node",
        "const command = process.argv[2];",
        "if (command === 'version') console.log('1.2.3');",
        "else if (command === 'help') console.log('publish verify delete update download extend');",
        "else process.exit(2);",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(mockCli, 0o700);

    const status = await getKleinanzeigenStatus({
      cliPath: mockCli,
      configPath: mockConfig,
      workingDirectory: tmp,
      workspaceMode: "portable",
    });

    assert.equal(status.ok, true);
    assert.equal(status.version, "1.2.3");
    assert.equal(status.configFile.exists, true);
    assert.equal(status.configFile.isFile, true);
    assert.deepEqual(status.commands, {
      verify: true,
      publish: true,
      update: true,
      delete: true,
      download: true,
      extend: true,
    });
    assert.doesNotMatch(JSON.stringify(status), /should-not-be-read|password/);
  });
});

describe("redacted output handling", () => {
  it("redacts credential-like lines, email addresses, and configured paths", () => {
    const text = [
      "ok /safe/path",
      "contact: person@example.invalid",
      "using /secret/config.yaml",
      "password: sample-value",
    ].join("\n");

    assert.equal(
      sanitizeText(text, ["/secret/config.yaml"], 1000),
      [
        "ok /safe/path",
        "contact: [redacted-email]",
        "[redacted sensitive line]",
        "[redacted sensitive line]",
      ].join("\n"),
    );
  });

  it("can suppress sanitized output entirely", () => {
    assert.equal(sanitizeText("password: sample-value", [], 0), "");
  });

  it("passes only allowlisted non-secret environment variables", () => {
    const env = buildChildEnv({
      PATH: "/bin",
      HOME: "/home/test",
      DEMO_PASSWORD: "sample",
      SERVICE_API_TOKEN: "sample",
      DISPLAY: ":0",
    });

    assert.deepEqual(env, {
      PATH: "/bin",
      HOME: "/home/test",
      DISPLAY: ":0",
    });
  });

  it("caps subprocess stdout and stderr while reading", async () => {
    const result = await runProcess(
      process.execPath,
      [
        "-e",
        "process.stdout.write('x'.repeat(20)); process.stderr.write('y'.repeat(20));",
      ],
      { maxBufferChars: 5 },
    );

    assert.equal(result.stdout.length, 6);
    assert.equal(result.stderr.length, 6);
    assert.equal(sanitizeText(result.stdout, [], 5), "xxxxx\n[truncated]");
    assert.equal(sanitizeText(result.stderr, [], 5), "yyyyy\n[truncated]");
  });

  it("detects local bot prompts that need a direct user run", () => {
    assert.equal(detectUserActionRequest("Press ENTER when done...").needsUserAction, true);
    assert.equal(detectUserActionRequest("EOFError: EOF when reading a line").needsUserAction, true);
    assert.equal(detectUserActionRequest("DONE: No configuration errors found.").needsUserAction, false);
  });
});
