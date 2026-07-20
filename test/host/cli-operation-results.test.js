import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runKleinanzeigenOperation } from "../../dist/cli.js";
import {
  withMockMiniclawScript,
  writeExecutableMockScript,
} from "../../test-support/host/command-runner.js";
import {
  mockResultLine,
  writeScopedAdFixture,
} from "../../test-support/host/cli-fixtures.js";

describe("operation results", () => {
  it("blocks scoped publish when the selected ad is inactive", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-preflight-"));
    const adDir = path.join(tmp, "ads", "lamp");
    const configPath = path.join(tmp, "config.yaml");
    const marker = path.join(tmp, "miniclaw-ran");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.writeFileSync(${JSON.stringify(marker)}, 'ran');`,
        "console.log('should not run');",
      ],
    );
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      adPath,
      "active: false\ntitle: Schreibtischlampe aus Metall\n",
      "utf8",
    );
    await fs.writeFile(
      configPath,
      `ad_files:\n  - ${JSON.stringify(adPath)}\n`,
      "utf8",
    );

    const result = await runKleinanzeigenOperation(
      "publish",
      { confirm: true, adDirectories: [adDir] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [path.join(tmp, "ads")],
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.outcome.status, "preflight_failed");
    assert.equal(result.processOk, false);
    assert.equal(result.exitCode, null);
    assert.equal(result.diagnostics[0].field, "active");
    assert.equal(result.diagnostics[0].active, false);
    assert.match(result.nextActions.join("\n"), /kleinanzeigen_set_ad_active/);
    await assert.rejects(() => fs.stat(marker), /ENOENT/);
  });

  it("rejects a success envelope when the process exits nonzero", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-outcome-"));
    const { adDir, adRoot, configPath } = await writeScopedAdFixture(tmp);
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        mockResultLine("publish", "succeeded", {
          counts: { changed: 1, failed: 0, total: 1 },
        }),
        "process.exit(1);",
      ],
    );

    const result = await runKleinanzeigenOperation(
      "publish",
      { confirm: true, adDirectories: [adDir] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [adRoot],
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.processOk, false);
    assert.equal(result.outcome.status, "protocol_error");
  });

  it("does not treat ad file changes as success evidence", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-outcome-"));
    const { adDir, adPath, adRoot, configPath } =
      await writeScopedAdFixture(tmp);
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.appendFileSync(${
          JSON.stringify(adPath)
        }, 'id: 2923863425\\n');`,
        "console.error('browser cleanup failed after publish');",
        "process.exit(1);",
      ],
    );

    const result = await runKleinanzeigenOperation(
      "publish",
      { confirm: true, adDirectories: [adDir] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [adRoot],
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.processOk, false);
    assert.equal(result.outcome.status, "protocol_error");
  });

  it("parses delete completion counts as changed and total ads", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-outcome-"));
    const { adDir, adRoot, configPath } = await writeScopedAdFixture(
      tmp,
      "title: Sample Listing\nid: 2923863425\n",
    );
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        mockResultLine("delete", "succeeded", {
          counts: { changed: 1, failed: 0, total: 1 },
        }),
        "process.exit(0);",
      ],
    );

    const result = await runKleinanzeigenOperation(
      "delete",
      {
        confirm: true,
        adIds: ["2923863425"],
        adDirectories: [adDir],
      },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [adRoot],
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.outcome.success, true);
    assert.equal(result.outcome.status, "succeeded");
    assert.deepEqual(result.outcome.counts, {
      changed: 1,
      failed: 0,
      total: 1,
    });
  });
});

describe("diagnostics", () => {
  it("returns structured guidance for a temporary IP-range block", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-ip-block-"));
    const { adDir, adRoot, configPath } = await writeScopedAdFixture(tmp);
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        mockResultLine("publish", "failed", {
          diagnostics: [{
            code: "ip_range_blocked",
            severity: "error",
            message:
              "Kleinanzeigen temporarily blocked this network or IP range.",
          }],
        }),
        "process.exit(4);",
      ],
    );

    try {
      const result = await runKleinanzeigenOperation(
        "publish",
        { confirm: true, adDirectories: [adDir] },
        withMockMiniclawScript(mockCli, {
          configPath,
          adRoots: [adRoot],
        }),
      );

      assert.equal(result.ok, false);
      assert.equal(result.exitCode, 4);
      assert.equal(result.needsUserAction, true);
      assert.match(result.userActionHint, /stop automatic retries/i);
      assert.deepEqual(result.diagnostics, [{
        severity: "error",
        kind: "ip_range_blocked",
        message:
          "Kleinanzeigen temporarily blocked this network or IP range.",
      }]);
      assert.deepEqual(result.nextActions, [
        "stop automatic retries and inform the user to try again later",
      ]);
      assert.doesNotMatch(JSON.stringify(result), /Ref#|IP#|2a01:/i);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("marks interactive account checks as user actions", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-manual-"));
    const { adDir, adRoot, configPath } = await writeScopedAdFixture(tmp);
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        mockResultLine("publish", "failed", {
          diagnostics: [{
            code: "manual_action_required",
            severity: "error",
            message: "Manual browser action requires an interactive run.",
          }],
        }),
        "process.exit(2);",
      ],
    );

    try {
      const result = await runKleinanzeigenOperation(
        "publish",
        { confirm: true, adDirectories: [adDir] },
        withMockMiniclawScript(mockCli, {
          configPath,
          adRoots: [adRoot],
        }),
      );

      assert.equal(result.ok, false);
      assert.equal(result.needsUserAction, true);
      assert.match(result.userActionHint, /interactive browser run/);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("returns diagnostics and next actions from failed miniclaw runs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-diag-"));
    const adDir = path.join(tmp, "drafts", "cut-n-run");
    const unrelatedDir = path.join(tmp, "SOLD", "shoes");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        mockResultLine("verify", "failed", {
          diagnostics: [{
            code: "validation_error",
            severity: "error",
            message: "title length exceeds 65 characters",
          }],
        }),
        "process.exit(1);",
      ],
    );
    const configPath = path.join(tmp, "config.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.mkdir(unrelatedDir, { recursive: true });
    await fs.writeFile(
      path.join(adDir, "ad.yaml"),
      "title: \"Cut and Run Ausstellung Banksy Tragetasche " +
        "/ 25 Years Card Labour Streetart\"\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(unrelatedDir, "ad.yaml"),
      "title: \"Original Prada Damen Schuhe Stiefeletten " +
        "Boots Schwarz Wildleder\"\n",
      "utf8",
    );
    await fs.writeFile(
      configPath,
      `ad_files:\n  - ${
        JSON.stringify(path.join(adDir, "ad.yaml"))
      }\ncategories: {}\n`,
      "utf8",
    );

    const result = await runKleinanzeigenOperation(
      "verify",
      {},
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [tmp],
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].kind, "validation_error");
    assert.deepEqual(result.nextActions, [
      "fix invalid config or ads and rerun kleinanzeigen_verify",
    ]);
  });

  it("does not attribute scoped title errors to unrelated long-title ads", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "kleinclaw-diag-scope-"),
    );
    const selectedDir = path.join(tmp, "ONGOING", "armani-jeans-01");
    const unrelatedDir = path.join(tmp, "ONGOING", "cut-n-run");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        mockResultLine("verify", "failed", {
          diagnostics: [{
            code: "validation_error",
            severity: "error",
            message: "title length exceeds 65 characters",
          }],
        }),
        "process.exit(1);",
      ],
    );
    const configPath = path.join(tmp, "config.yaml");
    await fs.mkdir(selectedDir, { recursive: true });
    await fs.mkdir(unrelatedDir, { recursive: true });
    await fs.writeFile(
      path.join(selectedDir, "ad.yaml"),
      "title: Neuwertige ARMANI Damen Stretch Jeans Gr. 29 schwarz\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(unrelatedDir, "ad.yaml"),
      "title: \"Cut and Run Ausstellung Banksy Tragetasche " +
        "/ 25 Years Card Labour Streetart\"\n",
      "utf8",
    );
    await fs.writeFile(
      configPath,
      [
        "ad_files:",
        `  - ${JSON.stringify(path.join(selectedDir, "ad.yaml"))}`,
        `  - ${JSON.stringify(path.join(unrelatedDir, "ad.yaml"))}`,
        "categories: {}",
        "",
      ].join("\n"),
      "utf8",
    );

    try {
      const result = await runKleinanzeigenOperation(
        "verify",
        { adDirectories: ["ONGOING/armani-jeans-01"] },
        withMockMiniclawScript(mockCli, {
          configPath,
          adRoots: [tmp],
        }),
      );

      assert.equal(result.ok, false);
      assert.equal(result.diagnostics[0].kind, "validation_error");
      assert.deepEqual(result.nextActions, [
        "fix the selected ad config and rerun scoped kleinanzeigen_verify",
      ]);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });
});
