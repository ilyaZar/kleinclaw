import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildRedactions,
  buildChildEnv,
  buildKleinanzeigenArgs,
  checkKleinanzeigenBrowser,
  configureKleinanzeigenBrowser,
  draftKleinanzeigenAd,
  detectUserActionRequest,
  extractKleinanzeigenDiagnostics,
  getKleinanzeigenAdSchema,
  getKleinanzeigenBrowserStatus,
  getKleinanzeigenStatus,
  listKleinanzeigenImages,
  listKleinanzeigenAds,
  redactArgs,
  readKleinanzeigenAd,
  runKleinanzeigenOperation,
  runProcess,
  sanitizeText,
  setKleinanzeigenAdActive,
} from "../src/cli.js";
import {
  createNodeCommandRunner,
  withCommandRunner,
  withMockMiniclawScript,
} from "./helpers/command-runner.js";

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

    assert.equal(status.ok, true);
    assert.equal(status.executable, "miniclaw");
    assert.equal(status.version, "2026+miniclaw");
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
});

describe("browser config tools", () => {
  it("reads only the non-secret browser config section", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-browser-"));
    const mockConfig = path.join(tmp, "config.yaml");
    await fs.writeFile(
      mockConfig,
      [
        "login:",
        "  username: hidden@example.invalid",
        "  password: should-not-leak",
        "browser:",
        "  arguments:",
        "    - --disable-dev-shm-usage",
        "    - --no-sandbox",
        "  binary_location: # \"/usr/bin/chromium\"",
        "  extensions: []",
        "  use_private_window: true",
        "  user_data_dir: \"\"",
        "  profile_name: \"\"",
      ].join("\n"),
      "utf8",
    );

    const status = await getKleinanzeigenBrowserStatus(withCommandRunner({
      configPath: mockConfig,
      workingDirectory: tmp,
      workspaceMode: "portable",
    }));

    assert.equal(status.ok, true);
    assert.equal(status.operation, "browser_status");
    assert.equal(status.browser.configured.browser, "auto");
    assert.deepEqual(status.browser.supportedChoices, [
      "auto",
      "chromium",
      "google-chrome",
      "microsoft-edge",
    ]);
    assert.equal(status.browser.configured.binaryLocation, "");
    assert.equal(status.browser.configured.usePrivateWindow, true);
    assert.equal(status.browser.effective.userDataDir, path.join(".temp", "browser-profile"));
    assert.deepEqual(status.browser.configured.arguments, [
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ]);
    assert.doesNotMatch(JSON.stringify(status), /should-not-leak|hidden@example/);
  });

  it("updates only selected browser keys after confirmation", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-browser-"));
    const mockConfig = path.join(tmp, "config.yaml");
    const mockBrowser = path.join(tmp, "mock-browser");
    await fs.writeFile(
      mockBrowser,
      "#!/usr/bin/env node\nconsole.log('Mock Browser 1.0')\n",
      "utf8",
    );
    await fs.chmod(mockBrowser, 0o700);
    await fs.writeFile(
      mockConfig,
      [
        "login:",
        "  username: hidden@example.invalid",
        "  password: should-not-leak",
        "browser:",
        "  arguments:",
        "    - --disable-dev-shm-usage",
        "  binary_location: \"\"",
        "  extensions: []",
        "  use_private_window: true",
        "  user_data_dir: \"/secret/profile\"",
        "  profile_name: \"Profile 1\"",
      ].join("\n"),
      "utf8",
    );

    const result = await configureKleinanzeigenBrowser(
      {
        confirm: true,
        binaryLocation: mockBrowser,
        allowUnsupportedBrowser: true,
        usePrivateWindow: false,
        profileMode: "workspace",
      },
      withCommandRunner({
        configPath: mockConfig,
        workingDirectory: tmp,
      }),
    );
    const updated = await fs.readFile(mockConfig, "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.operation, "browser_configure");
    assert.equal(result.changed, true);
    assert.match(updated, /password: should-not-leak/);
    assert.match(updated, new RegExp(`binary_location: ${JSON.stringify(mockBrowser)}`));
    assert.match(updated, /use_private_window: false/);
    assert.match(updated, /user_data_dir: ""/);
    assert.match(updated, /profile_name: ""/);
    assert.doesNotMatch(JSON.stringify(result), /should-not-leak|hidden@example|\/secret\/profile/);
  });

  it("rejects unsupported custom browser binaries by default", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-browser-"));
    const mockConfig = path.join(tmp, "config.yaml");
    const mockBrave = path.join(tmp, "brave");
    await fs.writeFile(mockBrave, "#!/usr/bin/env node\n", "utf8");
    await fs.chmod(mockBrave, 0o700);
    await fs.writeFile(
      mockConfig,
      [
        "browser:",
        "  binary_location: \"\"",
        "  use_private_window: true",
      ].join("\n"),
      "utf8",
    );

    await assert.rejects(
      () =>
        configureKleinanzeigenBrowser(
          { confirm: true, binaryLocation: mockBrave },
          withCommandRunner({ configPath: mockConfig, workingDirectory: tmp }),
        ),
      /not a supported miniclaw browser/,
    );
  });

  it("checks a browser through miniclaw diagnostics without changing config", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-browser-"));
    const mockConfig = path.join(tmp, "config.yaml");
    const mockBrowser = path.join(tmp, "mock-browser");
    const mockCli = path.join(tmp, "mock-cli.mjs");
    await fs.writeFile(mockBrowser, "#!/usr/bin/env node\nconsole.log('Mock Browser 1.0')\n", "utf8");
    await fs.chmod(mockBrowser, 0o700);
    await fs.writeFile(
      mockCli,
      [
        "#!/usr/bin/env node",
        "if (process.argv.includes('diagnose')) {",
        "  console.log('(ok) Browser binary exists: /tmp/mock-browser');",
        "  console.log('(ok) Browser binary is executable');",
        "  process.exit(0);",
        "}",
        "process.exit(2);",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(mockCli, 0o700);
    await fs.writeFile(
      mockConfig,
      [
        "browser:",
        "  binary_location: \"\"",
        "  use_private_window: true",
      ].join("\n"),
      "utf8",
    );

    const result = await checkKleinanzeigenBrowser(
      {
        binaryLocation: mockBrowser,
        allowUnsupportedBrowser: true,
        usePrivateWindow: false,
      },
      withMockMiniclawScript(mockCli, {
        configPath: mockConfig,
        workingDirectory: tmp,
      }),
    );
    const original = await fs.readFile(mockConfig, "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.operation, "browser_check");
    assert.equal(result.canUse, true);
    assert.equal(result.command.args.at(-1), "diagnose");
    assert.match(original, /binary_location: ""/);
  });
});

describe("ad authoring tools", () => {
  it("returns ad schema guidance without reading local config", () => {
    const result = getKleinanzeigenAdSchema();

    assert.equal(result.ok, true);
    assert.equal(result.operation, "ad_schema");
    assert.deepEqual(result.schema.requiredForDraft, ["title", "description", "category"]);
    assert.equal(result.schema.limits.title.maxLength, 65);
    assert.equal(result.schema.template.active, false);
  });

  it("reads one selected ad with contact fields redacted by default", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-read-ad-"));
    const adDir = path.join(tmp, "drafts", "sample-listing");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      adPath,
      [
        "active: true",
        "title: Sample Listing Audio",
        "description: Guter Zustand",
        "category: Elektronik > Audio",
        "contact:",
        "  name: Secret Name",
        "  phone: \"01234\"",
      ].join("\n"),
      "utf8",
    );

    const result = await readKleinanzeigenAd(
      { adDirectories: [adDir] },
      { adRoots: [tmp] },
    );

    assert.equal(result.ok, true);
    assert.equal(result.adPath, path.join("drafts", "sample-listing", "ad.yaml"));
    assert.equal(result.summary.title, "Sample Listing Audio");
    assert.match(result.yaml, /name: \[redacted-contact\]/);
    assert.doesNotMatch(result.yaml, /Secret Name|01234/);
  });

  it("lists local image files with dimensions and miniclaw support", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-images-"));
    const adDir = path.join(tmp, "drafts", "sample-listing");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      path.join(adDir, "sample-listing.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2jvWyAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    await fs.writeFile(path.join(adDir, "ignore.txt"), "not an image", "utf8");

    const result = await listKleinanzeigenImages(
      { directory: adDir },
      { adRoots: [tmp] },
    );

    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.equal(result.images[0].file, "sample-listing.png");
    assert.equal(result.images[0].width, 2);
    assert.equal(result.images[0].height, 3);
    assert.equal(result.images[0].supportedByMiniclaw, true);
  });

  it("creates a safe inactive ad draft under configured roots", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-draft-"));
    const adDir = path.join(tmp, "drafts", "sample-listing");

    const result = await draftKleinanzeigenAd(
      {
        confirm: true,
        directory: adDir,
        title: "Sample Listing Audio",
        description: "Guter Zustand.\nAbholung bevorzugt.",
        category: "Elektronik > Audio",
        price: 25,
        priceType: "NEGOTIABLE",
        shippingType: "PICKUP",
        images: ["sample-listing_*.{jpg,png}"],
        specialAttributes: { condition_s: "like_new" },
      },
      { adRoots: [tmp] },
    );
    const yaml = await fs.readFile(path.join(adDir, "ad.yaml"), "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.active, false);
    assert.match(yaml, /active: false/);
    assert.match(yaml, /title: "Sample Listing Audio"/);
    assert.match(yaml, /description: \|/);
    assert.match(yaml, /condition_s: "like_new"/);
    assert.match(yaml, /images:\n  - "sample-listing_\*\.\{jpg,png\}"/);
  });

  it("rejects draft image paths that escape the ad directory", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-draft-"));

    await assert.rejects(
      () =>
        draftKleinanzeigenAd(
          {
            confirm: true,
            directory: path.join(tmp, "draft"),
            title: "Sample Listing Audio",
            description: "Guter Zustand",
            category: "Elektronik > Audio",
            images: ["../secret.jpg"],
          },
          { adRoots: [tmp] },
        ),
      /relative to the ad directory/,
    );
  });

  it("sets one YAML ad active without rewriting other fields", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-active-"));
    const adDir = path.join(tmp, "drafts", "lamp");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      adPath,
      [
        "# yaml-language-server: $schema=https://example.invalid/ad.schema.json",
        "active: false",
        "title: Schreibtischlampe aus Metall",
        "category: Haus & Garten",
        "images:",
        "  - lampe_*.jpg",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await setKleinanzeigenAdActive(
      {
        confirm: true,
        adDirectories: [adDir],
        active: true,
      },
      { adRoots: [tmp] },
    );
    const yaml = await fs.readFile(adPath, "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.previousActive, false);
    assert.equal(result.active, true);
    assert.equal(result.summary.active, true);
    assert.match(yaml, /^active: true$/m);
    assert.match(yaml, /title: Schreibtischlampe aus Metall/);
    assert.match(yaml, /  - lampe_\*\.jpg/);
  });

  it("inserts an active flag when a YAML ad has no active field", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-active-"));
    const adDir = path.join(tmp, "drafts", "lamp");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      adPath,
      [
        "# yaml-language-server: $schema=https://example.invalid/ad.schema.json",
        "title: Schreibtischlampe aus Metall",
        "category: Haus & Garten",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await setKleinanzeigenAdActive(
      {
        confirm: true,
        adConfigPaths: [adPath],
        active: true,
      },
      { adRoots: [tmp] },
    );
    const yaml = await fs.readFile(adPath, "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.previousActive, null);
    assert.match(yaml, /^# yaml-language-server: .+\nactive: true\ntitle:/);
  });
});

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

    const result = await listKleinanzeigenAds({ adRoots: [tmp] }, { query: "sample-listing" });

    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.equal(result.ads[0].relativeDirectory, path.join("drafts", "sample-listing"));
    assert.equal(result.ads[0].title, "Sample Listing Audio");
    assert.equal(result.ads[0].id, "2923863425");
    assert.deepEqual(result.ads[0].imageGlobs, ["sample-listing_*.{jpg,png}"]);
  });

  it("runs with a temporary config limited to selected ad directories", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-scope-"));
    const adRoot = path.join(tmp, "ads");
    const adDir = path.join(adRoot, "sample-listing");
    const mockCli = path.join(tmp, "mock-cli.mjs");
    const configPath = path.join(tmp, "config.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(path.join(adDir, "ad.yaml"), "title: Sample Listing\n", "utf8");
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
    await fs.writeFile(
      mockCli,
      [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        "const configArg = process.argv.find((arg) => arg.startsWith('--config='));",
        "console.log(fs.readFileSync(configArg.slice('--config='.length), 'utf8'));",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(mockCli, 0o700);

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
    assert.match(result.stdout, /ad_files:\n  - "\[redacted-path\]\/sample-listing\/ad\.yaml"/);
    assert.doesNotMatch(result.stdout, /unrelated|should-not-leak/);
  });

  it("rejects scoped ad paths outside configured ad roots", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-scope-"));
    const adRoot = path.join(tmp, "ads");
    const outside = path.join(tmp, "outside");
    const configPath = path.join(tmp, "config.yaml");
    await fs.mkdir(adRoot, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(outside, "ad.yaml"), "title: Outside\n", "utf8");
    await fs.writeFile(configPath, "ad_files: []\ncategories: {}\n", "utf8");

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

  it("blocks scoped publish when the selected ad is inactive", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-preflight-"));
    const adDir = path.join(tmp, "ads", "lamp");
    const mockCli = path.join(tmp, "mock-cli.mjs");
    const configPath = path.join(tmp, "config.yaml");
    const marker = path.join(tmp, "miniclaw-ran");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      adPath,
      "active: false\ntitle: Schreibtischlampe aus Metall\n",
      "utf8",
    );
    await fs.writeFile(configPath, `ad_files:\n  - ${JSON.stringify(adPath)}\n`, "utf8");
    await fs.writeFile(
      mockCli,
      [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.writeFileSync(${JSON.stringify(marker)}, 'ran');`,
        "console.log('should not run');",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(mockCli, 0o700);

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

  it("returns publish success evidence even when the process exits noisy", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-outcome-"));
    const adDir = path.join(tmp, "ads", "sample-listing");
    const mockCli = path.join(tmp, "mock-cli.mjs");
    const configPath = path.join(tmp, "config.yaml");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(adPath, "active: true\ntitle: Sample Listing\n", "utf8");
    await fs.writeFile(configPath, `ad_files:\n  - ${JSON.stringify(adPath)}\n`, "utf8");
    await fs.writeFile(
      mockCli,
      [
        "#!/usr/bin/env node",
        "console.log(' -> SUCCESS: ad published with ID 2923863425');",
        "console.log('DONE: (Re-)published 1 ad');",
        "process.exit(1);",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(mockCli, 0o700);

    const result = await runKleinanzeigenOperation(
      "publish",
      { confirm: true, adDirectories: [adDir] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [path.join(tmp, "ads")],
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.processOk, false);
    assert.equal(result.outcome.status, "succeeded");
    assert.equal(result.outcome.success, true);
    assert.deepEqual(result.outcome.adIds, ["2923863425"]);
    assert.match(result.outcome.summary, /published 1 ad/);
  });

  it("uses selected ad config changes as publish success evidence", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-outcome-"));
    const adDir = path.join(tmp, "ads", "sample-listing");
    const mockCli = path.join(tmp, "mock-cli.mjs");
    const configPath = path.join(tmp, "config.yaml");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(adPath, "active: true\ntitle: Sample Listing\n", "utf8");
    await fs.writeFile(configPath, `ad_files:\n  - ${JSON.stringify(adPath)}\n`, "utf8");
    await fs.writeFile(
      mockCli,
      [
        "#!/usr/bin/env node",
        "import fs from 'node:fs';",
        `fs.appendFileSync(${JSON.stringify(adPath)}, 'id: 2923863425\\n');`,
        "console.error('browser cleanup failed after publish');",
        "process.exit(1);",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(mockCli, 0o700);

    const result = await runKleinanzeigenOperation(
      "publish",
      { confirm: true, adDirectories: [adDir] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [path.join(tmp, "ads")],
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.processOk, false);
    assert.equal(result.outcome.status, "succeeded");
    assert.deepEqual(result.outcome.changedAdConfigs, [
      {
        adPath: path.join("sample-listing", "ad.yaml"),
        title: "Sample Listing",
        id: "2923863425",
        changedFields: ["id"],
      },
    ]);
  });

  it("parses delete completion counts as changed and total ads", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-outcome-"));
    const adDir = path.join(tmp, "ads", "sample-listing");
    const mockCli = path.join(tmp, "mock-cli.mjs");
    const configPath = path.join(tmp, "config.yaml");
    const adPath = path.join(adDir, "ad.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(adPath, "title: Sample Listing\nid: 2923863425\n", "utf8");
    await fs.writeFile(configPath, `ad_files:\n  - ${JSON.stringify(adPath)}\n`, "utf8");
    await fs.writeFile(
      mockCli,
      [
        "#!/usr/bin/env node",
        "console.log('DONE: Deleted 1 of 1');",
        "process.exit(0);",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(mockCli, 0o700);

    const result = await runKleinanzeigenOperation(
      "delete",
      { confirm: true, adIds: ["2923863425"], adDirectories: [adDir] },
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [path.join(tmp, "ads")],
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.outcome.success, true);
    assert.equal(result.outcome.status, "succeeded");
    assert.deepEqual(result.outcome.counts, { changed: 1, failed: 0, total: 1 });
  });
});

describe("diagnostics", () => {
  it("adds structured guidance for miniclaw validation errors", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-diag-"));
    const adDir = path.join(tmp, "drafts", "cut-n-run");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      path.join(adDir, "ad.yaml"),
      'title: "Cut and Run Ausstellung Banksy Tragetasche / 25 Years Card Labour Streetart"\n',
      "utf8",
    );

    const diagnostics = await extractKleinanzeigenDiagnostics(
      [
        "[ERROR] 1 validation error for [AdPartial]:",
        "- title: Value error, title length exceeds 65 characters",
      ].join("\n"),
      { adRoots: [tmp] },
    );

    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].kind, "ad_validation");
    assert.equal(diagnostics[0].field, "title");
    assert.equal(diagnostics[0].adPath, path.join("drafts", "cut-n-run", "ad.yaml"));
    assert.equal(diagnostics[0].titleLength, 75);
    assert.equal(diagnostics[0].limit, 65);
  });

  it("returns diagnostics and next actions from failed miniclaw runs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-diag-"));
    const adDir = path.join(tmp, "drafts", "cut-n-run");
    const unrelatedDir = path.join(tmp, "SOLD", "shoes");
    const mockCli = path.join(tmp, "mock-cli.mjs");
    const configPath = path.join(tmp, "config.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.mkdir(unrelatedDir, { recursive: true });
    await fs.writeFile(
      path.join(adDir, "ad.yaml"),
      'title: "Cut and Run Ausstellung Banksy Tragetasche / 25 Years Card Labour Streetart"\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(unrelatedDir, "ad.yaml"),
      'title: "Original Prada Damen Schuhe Stiefeletten Boots Schwarz Wildleder"\n',
      "utf8",
    );
    await fs.writeFile(
      configPath,
      `ad_files:\n  - ${JSON.stringify(path.join(adDir, "ad.yaml"))}\ncategories: {}\n`,
      "utf8",
    );
    await fs.writeFile(
      mockCli,
      [
        "#!/usr/bin/env node",
        "console.error('[ERROR] 1 validation error for [AdPartial]:');",
        "console.error('- title: Value error, title length exceeds 65 characters');",
        "process.exit(1);",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(mockCli, 0o700);

    const result = await runKleinanzeigenOperation(
      "verify",
      {},
      withMockMiniclawScript(mockCli, {
        configPath,
        adRoots: [tmp],
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].adPath, path.join("drafts", "cut-n-run", "ad.yaml"));
    assert.equal(result.diagnostics[0].candidates.length, 1);
    assert.deepEqual(result.nextActions, [
      "use kleinanzeigen_list_ads to find the target ad",
      "use kleinanzeigen_verify with adDirectories or adConfigPaths for one ad",
      "fix invalid ads before unscoped verify or bulk publish",
    ]);
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

  it("redacts the config parent workspace path", () => {
    const configPath = path.join(os.tmpdir(), "kleinclaw-redactions", "config.yaml");
    const workspacePath = path.dirname(configPath);
    const output = sanitizeText(
      [`Workspace: ${workspacePath}`, `Config: ${configPath}`].join("\n"),
      buildRedactions({ configPath }),
      1000,
    );

    assert.equal(output, "Workspace: [redacted-path]\nConfig: [redacted-path]");
    assert.doesNotMatch(output, /kleinclaw-redactions|config\.yaml/);
  });

  it("does not redact every dot or slash for shallow config paths", () => {
    assert.equal(
      sanitizeText("DONE: version 1.2.3.", buildRedactions({ configPath: "config.yaml" }), 1000),
      "DONE: version 1.2.3.",
    );
    assert.equal(
      sanitizeText("Config: /config.yaml\nPath: /tmp/run", buildRedactions({ configPath: "/config.yaml" }), 1000),
      "Config: [redacted-path]\nPath: /tmp/run",
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
      { maxBufferChars: 5, commandRunner: createNodeCommandRunner() },
    );

    assert.equal(result.stdout.length, 6);
    assert.equal(result.stderr.length, 6);
    assert.equal(sanitizeText(result.stdout, [], 5), "xxxxx\n[truncated]");
    assert.equal(sanitizeText(result.stderr, [], 5), "yyyyy\n[truncated]");
  });

  it("detects miniclaw prompts that need a direct user run", () => {
    assert.equal(detectUserActionRequest("Press ENTER when done...").needsUserAction, true);
    assert.equal(detectUserActionRequest("Captcha detected. Sleeping 6h before restart...").needsUserAction, true);
    assert.equal(detectUserActionRequest("# Captcha vorhanden! Bitte lösen Sie das Captcha.").needsUserAction, true);
    assert.equal(detectUserActionRequest("EOFError: EOF when reading a line").needsUserAction, true);
    assert.equal(detectUserActionRequest("DONE: No configuration errors found.").needsUserAction, false);
  });
});
