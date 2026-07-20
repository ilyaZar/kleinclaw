import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  listKleinanzeigenAds,
  readKleinanzeigenAd,
  runKleinanzeigenOperation,
  setKleinanzeigenAdActive,
} from "../../dist/cli.js";
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
  escapeRegExp,
} from "../../test-support/host/cli-redaction-test-helpers.js";

describe("scoped ad configs", () => {
  it("lists ad folders under configured roots", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-list-"));
    const adDir = path.join(tmp, "drafts", "sample-listing");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      path.join(adDir, "ad.yaml"),
      [
        "active: true",
        "title: Sample Listing Audio",
        "category: Audio_und_Hifi",
        "price: 15.00",
        "id: 2923863425",
        "images:",
        "  - sample-listing_*.{jpg,png}",
      ].join("\n"),
      "utf8",
    );

    const result = await listKleinanzeigenAds(
      { adRoots: [tmp] },
      { query: "sample-listing" },
    );

    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.equal(
      result.ads[0].relativeDirectory,
      path.join("drafts", "sample-listing"),
    );
    assert.equal(
      result.ads[0].adDirectory,
      path.join("drafts", "sample-listing"),
    );
    assert.equal(
      result.ads[0].adPath,
      path.join("drafts", "sample-listing", "ad.yaml"),
    );
    assert.equal(result.ads[0].title, "Sample Listing Audio");
    assert.equal(result.ads[0].id, "2923863425");
    assert.deepEqual(result.ads[0].imageGlobs, [
      "sample-listing_*.{jpg,png}",
    ]);
    assert.equal(Object.hasOwn(result.ads[0], "root"), false);
    assert.equal(Object.hasOwn(result.ads[0], "directory"), false);
    assert.equal(Object.hasOwn(result.ads[0], "adConfigPath"), false);
    const escapedTmp = tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.doesNotMatch(JSON.stringify(result), new RegExp(escapedTmp));
  });

  it("uses relative list handles for scoped read, activate, verify, and publish", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-handles-"));
    const { adPath, adRoot, configPath } = await writeScopedAdFixture(
      tmp,
      [
        "active: false",
        "title: Sample Listing Audio",
        "category: Audio_und_Hifi",
        "images:",
        "  - sample-listing_*.jpg",
        "",
      ].join("\n"),
    );
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "if (process.argv.includes('verify')) {",
        `  ${mockResultLine("verify")}`,
        "  process.exit(0);",
        "}",
        "if (process.argv.includes('publish')) {",
        `  ${mockResultLine("publish", "succeeded", {
          counts: { changed: 1, failed: 0, total: 1 },
        })}`,
        "  process.exit(0);",
        "}",
        "process.exit(2);",
      ],
    );

    const list = await listKleinanzeigenAds(
      { adRoots: [adRoot] },
      { query: "sample-listing" },
    );
    const handle = list.ads[0];

    assert.equal(handle.adDirectory, "sample-listing");
    assert.equal(handle.adPath, path.join("sample-listing", "ad.yaml"));

    const read = await readKleinanzeigenAd(
      { adDirectories: [handle.adDirectory] },
      { adRoots: [adRoot] },
    );
    const activated = await setKleinanzeigenAdActive(
      {
        confirm: true,
        adConfigPaths: [handle.adPath],
        active: true,
      },
      { adRoots: [adRoot] },
    );
    const verify = await runKleinanzeigenOperation(
      "verify",
      { adDirectories: [handle.adDirectory] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [adRoot],
      }),
    );
    const publish = await runKleinanzeigenOperation(
      "publish",
      { confirm: true, adConfigPaths: [handle.adPath] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [adRoot],
      }),
    );
    const updated = await fs.readFile(adPath, "utf8");

    assert.equal(read.ok, true);
    assert.equal(read.adPath, handle.adPath);
    assert.equal(activated.ok, true);
    assert.equal(activated.changed, true);
    assert.match(updated, /^active: true$/m);
    assert.equal(verify.ok, true);
    assert.equal(publish.ok, true);
    assertJsonOmits(
      [list, read, activated, verify, publish],
      [tmp, adRoot, configPath, adPath],
    );
  });

  it("rejects ambiguous relative ad handles without leaking roots", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-handles-"));
    const rootA = path.join(tmp, "root-a");
    const rootB = path.join(tmp, "root-b");
    for (const root of [rootA, rootB]) {
      const adDir = path.join(root, "sample-listing");
      await fs.mkdir(adDir, { recursive: true });
      await fs.writeFile(
        path.join(adDir, "ad.yaml"),
        "title: Sample Listing\n",
        "utf8",
      );
    }

    await assert.rejects(
      () =>
        readKleinanzeigenAd(
          { adDirectories: ["sample-listing"] },
          { adRoots: [rootA, rootB] },
        ),
      (error) => {
        assert.match(error.message, /matches multiple adRoots/);
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(tmp)));
        return true;
      },
    );
  });

  it("runs scoped operations by passing selected ad files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-scope-"));
    const adRoot = path.join(tmp, "ads");
    const adDir = path.join(adRoot, "sample-listing");
    const marker = path.join(tmp, "argv.json");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.writeFileSync(${
          JSON.stringify(marker)
        }, JSON.stringify(process.argv.slice(2)));`,
        mockResultLine("verify"),
      ],
    );
    const configPath = path.join(tmp, "config.yaml");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(adPath, "title: Sample Listing\n", "utf8");
    await fs.writeFile(
      configPath,
      [
        "ad_files:",
        "  - /unrelated/broken/ad.yaml",
        "login:",
        "  password: should-not-leak",
        "categories: {}",
      ].join("\n"),
      "utf8",
    );

    const result = await runKleinanzeigenOperation(
      "verify",
      { adDirectories: [adDir] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [adRoot],
        maxOutputChars: 2000,
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(await fs.readFile(marker, "utf8")), [
      `--config=${configPath}`,
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      `--ad-file=${adPath}`,
      "verify",
    ]);
    assert.deepEqual(result.command.args, [
      "--config=[redacted]",
      "--logfile=",
      "--workspace-mode=portable",
      "--output=json",
      "--ad-file=[redacted]",
      "verify",
    ]);
    assert.equal(result.stdout, "");
    assertJsonOmits(result, [
      tmp,
      adRoot,
      adPath,
      configPath,
      "should-not-leak",
    ]);
  });
});
