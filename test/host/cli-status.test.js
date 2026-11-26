import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { getKleinanzeigenStatus } from "../../dist/miniclaw-runtime.js";
import {
  withCommandRunner,
  withMockMiniclawScript,
  writeExecutableMockScript,
} from "../../test-support/host/command-runner.js";
import { mockResultLine } from "../../test-support/host/cli-fixtures.js";

describe("kleinanzeigen CLI status", () => {
  it("checks executable capabilities without reading config contents", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-status-"));
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "const command = process.argv.at(-1);",
        `if (command === 'version') ${mockResultLine("version", "succeeded", {
          version: "1.2.3",
          commands: [
            "publish",
            "verify",
            "delete",
            "update",
            "download",
            "extend",
          ],
        })}`,
        "else process.exit(2);",
      ],
    );
    const mockConfig = path.join(tmp, "config.yaml");
    await fs.writeFile(mockConfig, "password: should-not-be-read\n", "utf8");

    const status = await getKleinanzeigenStatus(withMockMiniclawScript(mockCli, {
      configPath: mockConfig,
      workingDirectory: tmp,
      workspaceMode: "portable",
    }));

    assert.equal(status.ok, true);
    assert.equal(status.version, "1.2.3");
    assert.equal(status.configFile.exists, true);
    assert.equal(status.configFile.isFile, true);
    assert.deepEqual(status.commands, {
      verify: true,
      diagnose: false,
      publish: true,
      update: true,
      delete: true,
      download: true,
      extend: true,
    });
    assert.doesNotMatch(JSON.stringify(status), /should-not-be-read|password/);
  });

  it("uses the embedded miniclaw runtime by default", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-status-"));
    const mockConfig = path.join(tmp, "config.yaml");
    await fs.writeFile(mockConfig, "password: should-not-be-read\n", "utf8");

    const status = await getKleinanzeigenStatus(withCommandRunner({
      configPath: mockConfig,
      workingDirectory: tmp,
      workspaceMode: "portable",
    }));
    const miniclawPackage = JSON.parse(
      await fs.readFile("miniclaw/package.json", "utf8"),
    );

    assert.equal(status.ok, true);
    assert.equal(status.executable, "miniclaw");
    assert.equal(status.version, miniclawPackage.version);
    assert.deepEqual(status.commands, {
      verify: true,
      diagnose: true,
      publish: true,
      update: true,
      delete: true,
      download: true,
      extend: true,
    });
    assert.doesNotMatch(JSON.stringify(status), /should-not-be-read|password/);
  });

  it("rejects a failed version envelope even when the process exits zero", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-status-"));
    const configPath = path.join(tmp, "config.yaml");
    await fs.writeFile(configPath, "", "utf8");
    const status = await getKleinanzeigenStatus({
      configPath,
      commandRunner: async () => ({
        code: 0,
        stdout: JSON.stringify({
          schemaVersion: 1,
          command: "version",
          status: "failed",
          version: "invalid",
          commands: ["verify"],
        }),
      }),
    });

    assert.equal(status.ok, false);
    assert.equal(status.version, "");
    assert.deepEqual(Object.values(status.commands), Array(7).fill(false));
  });
});
