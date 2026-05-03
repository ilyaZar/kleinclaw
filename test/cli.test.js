import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildChildEnv,
  buildKleinanzeigenArgs,
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
        cliProfile: "legacy",
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
      ["--config=config.yaml", "--logfile=", "delete", "--ads=123,456"],
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
  });

  it("requires current CLI profile for update and extend", () => {
    assert.throws(
      () => buildKleinanzeigenArgs("update", { confirm: true }, { configPath: "config.yaml" }),
      /cliProfile=current/,
    );
    assert.deepEqual(
      buildKleinanzeigenArgs(
        "extend",
        { confirm: true },
        { configPath: "config.yaml", cliProfile: "current" },
      ),
      ["--config=config.yaml", "--logfile=", "extend", "--ads=all"],
    );
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
});
