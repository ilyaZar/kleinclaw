import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildRedactions,
  buildChildEnv,
  buildKleinanzeigenArgs,
  detectUserActionRequest,
  extractKleinanzeigenDiagnostics,
  getKleinanzeigenStatus,
  listKleinanzeigenAds,
  redactArgs,
  runKleinanzeigenOperation,
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

describe("scoped ad configs", () => {
  it("lists ad folders under configured roots", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-list-"));
    const adDir = path.join(tmp, "ONGOING", "boxen");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(
      path.join(adDir, "ad.yaml"),
      [
        "active: true",
        "title: Boxen von Kenwood",
        "category: Audio_und_Hifi",
        "price: 15.00",
        "id: 2923863425",
        "images:",
        "  - boxen_*.{jpg,png}",
      ].join("\n"),
      "utf8",
    );

    const result = await listKleinanzeigenAds({ adRoots: [tmp] }, { query: "boxen" });

    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.equal(result.ads[0].relativeDirectory, path.join("ONGOING", "boxen"));
    assert.equal(result.ads[0].title, "Boxen von Kenwood");
    assert.equal(result.ads[0].id, "2923863425");
    assert.deepEqual(result.ads[0].imageGlobs, ["boxen_*.{jpg,png}"]);
  });

  it("runs with a temporary config limited to selected ad directories", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-scope-"));
    const adRoot = path.join(tmp, "ads");
    const adDir = path.join(adRoot, "boxen");
    const mockCli = path.join(tmp, "mock-cli.mjs");
    const configPath = path.join(tmp, "config.yaml");
    await fs.mkdir(adDir, { recursive: true });
    await fs.writeFile(path.join(adDir, "ad.yaml"), "title: Boxen\n", "utf8");
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
      {
        cliPath: mockCli,
        configPath,
        adRoots: [adRoot],
        maxOutputChars: 2000,
      },
    );

    assert.equal(result.ok, true);
    assert.match(result.stdout, /ad_files:\n  - "\[redacted-path\]\/boxen\/ad\.yaml"/);
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
            cliPath: "kleinanzeigen-bot",
            configPath,
            adRoots: [adRoot],
          },
        ),
      /outside configured adRoots/,
    );
  });
});

describe("diagnostics", () => {
  it("adds structured guidance for bot validation errors", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-diag-"));
    const adDir = path.join(tmp, "ONGOING", "cut-n-run");
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
    assert.equal(diagnostics[0].adPath, path.join("ONGOING", "cut-n-run", "ad.yaml"));
    assert.equal(diagnostics[0].titleLength, 75);
    assert.equal(diagnostics[0].limit, 65);
  });

  it("returns diagnostics and next actions from failed bot runs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-diag-"));
    const adDir = path.join(tmp, "ONGOING", "cut-n-run");
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
      {
        cliPath: mockCli,
        configPath,
        adRoots: [tmp],
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].adPath, path.join("ONGOING", "cut-n-run", "ad.yaml"));
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
      { maxBufferChars: 5 },
    );

    assert.equal(result.stdout.length, 6);
    assert.equal(result.stderr.length, 6);
    assert.equal(sanitizeText(result.stdout, [], 5), "xxxxx\n[truncated]");
    assert.equal(sanitizeText(result.stderr, [], 5), "yyyyy\n[truncated]");
  });

  it("detects local bot prompts that need a direct user run", () => {
    assert.equal(detectUserActionRequest("Press ENTER when done...").needsUserAction, true);
    assert.equal(detectUserActionRequest("Captcha detected. Sleeping 6h before restart...").needsUserAction, true);
    assert.equal(detectUserActionRequest("# Captcha vorhanden! Bitte lösen Sie das Captcha.").needsUserAction, true);
    assert.equal(detectUserActionRequest("EOFError: EOF when reading a line").needsUserAction, true);
    assert.equal(detectUserActionRequest("DONE: No configuration errors found.").needsUserAction, false);
  });
});
