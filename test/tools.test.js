import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  APPROVAL_TOOL_NAMES,
  createKleinanzeigenTools,
  OPTIONAL_TOOL_NAMES,
  SIDE_EFFECT_TOOL_NAMES,
} from "../src/tools.js";

describe("kleinanzeigen plugin tools", () => {
  it("keeps mutating tools separate while approval gating local CLI tools", () => {
    const tools = createKleinanzeigenTools();
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_verify"), false);
    assert.equal(SIDE_EFFECT_TOOL_NAMES.has("kleinanzeigen_status"), false);
    assert.equal(OPTIONAL_TOOL_NAMES.has("kleinanzeigen_verify"), true);
    assert.equal(OPTIONAL_TOOL_NAMES.has("kleinanzeigen_status"), true);
    assert.equal(APPROVAL_TOOL_NAMES.has("kleinanzeigen_verify"), true);
    assert.equal(APPROVAL_TOOL_NAMES.has("kleinanzeigen_status"), true);
    assert.equal(tools.length, 7);
    assert.deepEqual(
      tools.filter((tool) => SIDE_EFFECT_TOOL_NAMES.has(tool.name)).map((tool) => tool.name),
      [
        "kleinanzeigen_publish",
        "kleinanzeigen_update",
        "kleinanzeigen_delete",
        "kleinanzeigen_download",
        "kleinanzeigen_extend",
      ],
    );
    assert.deepEqual([...APPROVAL_TOOL_NAMES], [...OPTIONAL_TOOL_NAMES]);
  });

  it("runs a mock CLI and returns sanitized output", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinanzeigen-helper-test-"));
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
    }).find((tool) => tool.name === "kleinanzeigen_verify");

    const result = await verify.execute("tool-call", {});
    const payload = JSON.parse(result.content[0].text);

    assert.equal(payload.ok, true);
    assert.deepEqual(payload.command.args, ["--config=[redacted]", "--logfile=", "verify"]);
    assert.match(payload.stdout, /using \[redacted-path\]/);
    assert.equal(payload.stderr, "[redacted sensitive line]");
    assert.doesNotMatch(result.content[0].text, /should-not-leak|private\/config/);
  });
});
