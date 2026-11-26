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
import {
  assertJsonOmits,
  SENTINEL_COOKIE,
  SENTINEL_PASSWORD,
  SENTINEL_PROFILE_DIR,
  SENTINEL_PROFILE_NAME,
  SENTINEL_TOKEN,
  SENTINEL_USER,
  sentinelNeedles,
} from "../../test-support/host/cli-redaction-test-helpers.js";

describe("scoped operation selection", () => {
  it("scopes numeric local ad ID operations to matching ad files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-id-scope-"));
    const adRoot = path.join(tmp, "ads");
    const selectedDir = path.join(adRoot, "ONGOING", "armani-jeans-01");
    const unrelatedDir = path.join(adRoot, "ONGOING", "cut-n-run");
    const selectedPath = path.join(selectedDir, "ad.yaml");
    const unrelatedPath = path.join(unrelatedDir, "ad.yaml");
    const configPath = path.join(tmp, "config.yaml");
    const marker = path.join(tmp, "argv.json");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.writeFileSync(${
          JSON.stringify(marker)
        }, JSON.stringify(process.argv.slice(2)));`,
        mockResultLine("publish", "succeeded", {
          counts: { changed: 1, failed: 0, total: 1 },
        }),
      ],
    );
    await fs.mkdir(selectedDir, { recursive: true });
    await fs.mkdir(unrelatedDir, { recursive: true });
    await fs.writeFile(
      selectedPath,
      [
        "active: true",
        "id: 2923858274",
        "title: Neuwertige ARMANI Damen Stretch Jeans Gr. 29 schwarz",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      unrelatedPath,
      [
        "active: true",
        "id: 9999999999",
        "title: Cut and Run Ausstellung Banksy Tragetasche / 25 Years Card Labour Streetart",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      configPath,
      [
        "ad_files:",
        '  - "**/ad.yaml"',
        "categories: {}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runKleinanzeigenOperation(
      "publish",
      { confirm: true, adIds: ["2923858274"] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [adRoot],
      }),
    );
    const argv = JSON.parse(await fs.readFile(marker, "utf8"));

    assert.equal(result.ok, true);
    assert.deepEqual(argv, [
      `--config=${configPath}`,
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      `--ad-file=${selectedPath}`,
      "--allow-live-browser",
      "--manual-action-timeout=300",
      "publish",
      "--ads=2923858274",
    ]);
    assert.equal(argv.includes(`--ad-file=${unrelatedPath}`), false);
    assert.deepEqual(result.command.args, [
      "--config=[redacted]",
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      "--ad-file=[redacted]",
      "--allow-live-browser",
      "--manual-action-timeout=300",
      "publish",
      "--ads=2923858274",
    ]);
  });

  it("does not scope numeric downloads through local ad files", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "kleinclaw-id-download-"),
    );
    const { adPath, adRoot, configPath } = await writeScopedAdFixture(
      tmp,
      "active: true\nid: 2923858274\ntitle: Sample Listing\n",
    );
    const marker = path.join(tmp, "argv.json");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.writeFileSync(${
          JSON.stringify(marker)
        }, JSON.stringify(process.argv.slice(2)));`,
        mockResultLine("download", "succeeded", {
          counts: { changed: 1, failed: 0, total: 1 },
        }),
      ],
    );

    const result = await runKleinanzeigenOperation(
      "download",
      { confirm: true, adIds: ["2923858274"] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [adRoot],
      }),
    );
    const argv = JSON.parse(await fs.readFile(marker, "utf8"));

    assert.equal(result.ok, true);
    assert.deepEqual(argv, [
      `--config=${configPath}`,
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      "--allow-live-browser",
      "--manual-action-timeout=300",
      "download",
      "--ads=2923858274",
    ]);
    assert.equal(argv.includes(`--ad-file=${adPath}`), false);
  });

  it("keeps multi-ID operations unscoped unless every ID is local", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "kleinclaw-id-partial-"),
    );
    const { adPath, adRoot, configPath } = await writeScopedAdFixture(
      tmp,
      "active: true\nid: 2923858274\ntitle: Sample Listing\n",
    );
    const marker = path.join(tmp, "argv.json");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.writeFileSync(${
          JSON.stringify(marker)
        }, JSON.stringify(process.argv.slice(2)));`,
        mockResultLine("update", "no_op", {
          counts: { changed: 0, failed: 0, total: 0 },
        }),
      ],
    );

    const result = await runKleinanzeigenOperation(
      "update",
      { confirm: true, adIds: ["2923858274", "1111111111"] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [adRoot],
      }),
    );
    const argv = JSON.parse(await fs.readFile(marker, "utf8"));

    assert.equal(result.ok, true);
    assert.deepEqual(argv, [
      `--config=${configPath}`,
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      "--allow-live-browser",
      "--manual-action-timeout=300",
      "update",
      "--ads=2923858274,1111111111",
    ]);
    assert.equal(argv.includes(`--ad-file=${adPath}`), false);
  });

  it("does not create scoped temp configs on success or failure", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "kleinclaw-temp-config-"),
    );
    const { adDir, adPath, adRoot, configPath } =
      await writeScopedAdFixture(tmp);
    const profilePath = path.join(tmp, SENTINEL_PROFILE_DIR);
    await fs.writeFile(
      configPath,
      [
        "ad_files:",
        "  - /unrelated/broken/ad.yaml",
        "login:",
        `  username: ${SENTINEL_USER}`,
        `  password: ${SENTINEL_PASSWORD}`,
        `cookie: ${SENTINEL_COOKIE}`,
        `token: ${SENTINEL_TOKEN}`,
        "browser:",
        `  user_data_dir: ${JSON.stringify(profilePath)}`,
        `  profile_name: ${JSON.stringify(SENTINEL_PROFILE_NAME)}`,
        "categories: {}",
      ].join("\n"),
      "utf8",
    );

    async function runScenario(name, exitCode) {
      const marker = path.join(tmp, `${name}-marker.json`);
      const mockCli = await writeExecutableMockScript(
        path.join(tmp, `${name}-mock-cli.mjs`),
        [
          "#!/usr/bin/env node",
          "import fs from 'node:fs';",
          `fs.writeFileSync(${
            JSON.stringify(marker)
          }, JSON.stringify(process.argv.slice(2)));`,
          exitCode === 0
            ? mockResultLine("verify")
            : mockResultLine("verify", "failed", {
              diagnostics: [{
                code: "internal_error",
                severity: "error",
                message: "verify failed",
              }],
            }),
          `process.exit(${exitCode});`,
        ],
      );

      const result = await runKleinanzeigenOperation(
        "verify",
        { adDirectories: [path.basename(adDir)] },
        withMockMiniclawScript(mockCli, {
          configPath,
          adRoots: [adRoot],
          maxOutputChars: 4000,
        }),
      );
      const argv = JSON.parse(await fs.readFile(marker, "utf8"));
      const tempConfigNames = (await fs.readdir(tmp))
        .filter((entry) => entry.startsWith(".kleinclaw-"));

      assert.deepEqual(argv, [
        `--config=${configPath}`,
        "--logfile=",
        "--workspace-mode=portable",
        "--output=json",
        `--ad-file=${adPath}`,
        "verify",
      ]);
      assert.deepEqual(tempConfigNames, []);
      assertJsonOmits(
        result,
        [
          tmp,
          adRoot,
          adPath,
          configPath,
          ...sentinelNeedles({ profilePath }),
        ],
      );
      return result;
    }

    const success = await runScenario("success", 0);
    const failure = await runScenario("failure", 1);

    assert.equal(success.ok, true);
    assert.equal(failure.ok, false);
  });

  it("rejects scoped ad paths outside configured ad roots", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-scope-"));
    const adRoot = path.join(tmp, "ads");
    const outside = path.join(tmp, "outside");
    const configPath = path.join(tmp, "config.yaml");
    await fs.mkdir(adRoot, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(
      path.join(outside, "ad.yaml"),
      "title: Outside\n",
      "utf8",
    );
    await fs.writeFile(
      configPath,
      "ad_files: []\ncategories: {}\n",
      "utf8",
    );

    await assert.rejects(
      () =>
        runKleinanzeigenOperation(
          "verify",
          { adDirectories: [outside] },
          {
            configPath,
            adRoots: [adRoot],
          },
        ),
      /outside configured adRoots/,
    );
  });
});
