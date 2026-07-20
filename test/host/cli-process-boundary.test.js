import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildChildEnv,
  buildRedactions,
  runProcess,
  sanitizeText,
} from "../../dist/process-boundary.js";
import { createKleinanzeigenTools } from "../../dist/tools.js";
import {
  createNodeCommandRunner,
  withMockMiniclawScript,
  writeExecutableMockScript,
} from "../../test-support/host/command-runner.js";
import {
  assertJsonOmits,
  SENTINEL_PASSWORD,
} from "../../test-support/host/cli-redaction-test-helpers.js";

async function executeKleinanzeigenTool(config, name, params = {}) {
  const tool = createKleinanzeigenTools(config)
    .find((entry) => entry.name === name);
  assert.ok(tool, `tool ${name} should exist`);
  const result = await tool.execute("test-call", params);
  return JSON.parse(result.content[0].text);
}

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

  it("redacts the config parent workspace path", () => {
    const configPath = path.join(
      os.tmpdir(),
      "kleinclaw-redactions",
      "config.yaml",
    );
    const workspacePath = path.dirname(configPath);
    const output = sanitizeText(
      [`Workspace: ${workspacePath}`, `Config: ${configPath}`].join("\n"),
      buildRedactions({ configPath }),
      1000,
    );

    assert.equal(
      output,
      "Workspace: [redacted-path]\nConfig: [redacted-path]",
    );
    assert.doesNotMatch(output, /kleinclaw-redactions|config\.yaml/);
  });

  it("does not redact every dot or slash for shallow config paths", () => {
    assert.equal(
      sanitizeText(
        "DONE: version 1.2.3.",
        buildRedactions({ configPath: "config.yaml" }),
        1000,
      ),
      "DONE: version 1.2.3.",
    );
    assert.equal(
      sanitizeText(
        "Config: /config.yaml\nPath: /tmp/run",
        buildRedactions({ configPath: "/config.yaml" }),
        1000,
      ),
      "Config: [redacted-path]\nPath: /tmp/run",
    );
  });

  it("keeps agent-facing failure payloads free of local paths and secrets", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-errors-"));
    const adRoot = path.join(tmp, "ads");
    const adDir = path.join(adRoot, "sample-listing");
    const outsideDir = path.join(tmp, "outside");
    const configPath = path.join(tmp, "config.yaml");
    const unreadableConfigPath = path.join(tmp, "unreadable-config.yaml");
    const invalidJsonConfigPath = path.join(tmp, "invalid-config.json");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "console.error(process.argv.join(' '));",
        `console.error('password: ${SENTINEL_PASSWORD}');`,
        "process.exit(2);",
      ],
    );
    await fs.mkdir(adDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(
      path.join(adDir, "ad.yaml"),
      "title: Sample Listing\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(outsideDir, "ad.yaml"),
      "title: Outside Listing\n",
      "utf8",
    );
    await fs.writeFile(
      configPath,
      "ad_files: []\ncategories: {}\n",
      "utf8",
    );
    await fs.writeFile(
      unreadableConfigPath,
      `password: ${SENTINEL_PASSWORD}\n`,
      { encoding: "utf8", mode: 0o000 },
    );
    await fs.writeFile(
      invalidJsonConfigPath,
      `{"password":${JSON.stringify(SENTINEL_PASSWORD)},`,
      "utf8",
    );

    try {
      const baseConfig = {
        configPath,
        adRoots: [adRoot],
      };
      const payloads = [];
      payloads.push(
        await executeKleinanzeigenTool(
          baseConfig,
          "kleinanzeigen_read_ad",
          { adDirectories: [path.join(adRoot, "missing-listing")] },
        ),
      );
      payloads.push(
        await executeKleinanzeigenTool(
          baseConfig,
          "kleinanzeigen_read_ad",
          { adDirectories: [outsideDir] },
        ),
      );
      payloads.push(
        await executeKleinanzeigenTool(
          { ...baseConfig, configPath: unreadableConfigPath },
          "kleinanzeigen_browser_status",
        ),
      );
      payloads.push(
        await executeKleinanzeigenTool(
          withMockMiniclawScript(mockCli, {
            configPath: invalidJsonConfigPath,
            adRoots: [adRoot],
          }),
          "kleinanzeigen_verify",
          { adDirectories: ["sample-listing"] },
        ),
      );
      payloads.push(
        await executeKleinanzeigenTool(
          baseConfig,
          "kleinanzeigen_browser_check",
          {
            binaryLocation: path.join(tmp, "missing-browser"),
            allowUnsupportedBrowser: true,
          },
        ),
      );
      payloads.push(
        await executeKleinanzeigenTool(
          {
            ...baseConfig,
            commandRunner: async () => {
              throw new Error(
                `${tmp}/runner failed with ${SENTINEL_PASSWORD}`,
              );
            },
          },
          "kleinanzeigen_verify",
        ),
      );

      for (const payload of payloads) {
        assert.equal(payload.ok, false);
      }
      assertJsonOmits(
        payloads,
        [
          tmp,
          adRoot,
          outsideDir,
          configPath,
          unreadableConfigPath,
          invalidJsonConfigPath,
          "missing-listing",
          "missing-browser",
          SENTINEL_PASSWORD,
        ],
      );
    } finally {
      await fs.chmod(unreadableConfigPath, 0o600).catch(() => {});
    }
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
        "process.stdout.write('x'.repeat(20)); " +
          "process.stderr.write('y'.repeat(20));",
      ],
      { maxBufferChars: 5, commandRunner: createNodeCommandRunner() },
    );

    assert.equal(result.stdout.length, 6);
    assert.equal(result.stderr.length, 6);
    assert.equal(sanitizeText(result.stdout, [], 5), "xxxxx\n[truncated]");
    assert.equal(sanitizeText(result.stderr, [], 5), "yyyyy\n[truncated]");
  });
});
