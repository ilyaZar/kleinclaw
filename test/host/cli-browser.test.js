import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  checkKleinanzeigenBrowser,
  configureKleinanzeigenBrowser,
  getKleinanzeigenBrowserStatus,
} from "../../dist/cli.js";
import {
  withCommandRunner,
  withMockMiniclawScript,
  writeExecutableMockScript,
} from "../../test-support/host/command-runner.js";
import { mockResultLine } from "../../test-support/host/cli-fixtures.js";
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
    assert.equal(
      status.browser.effective.userDataDir,
      path.join(".temp", "browser-profile"),
    );
    assert.deepEqual(status.browser.configured.arguments, [
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ]);
    assert.doesNotMatch(JSON.stringify(status), /should-not-leak|hidden@example/);
  });

  it("updates only safe browser keys after confirmation", async () => {
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
        "  binary_location: \"/usr/bin/old-browser\"",
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
        browser: "auto",
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
    assert.match(updated, /binary_location: ""/);
    assert.match(updated, /use_private_window: false/);
    assert.match(updated, /user_data_dir: ""/);
    assert.match(updated, /profile_name: ""/);
    assert.doesNotMatch(
      JSON.stringify(result),
      /should-not-leak|hidden@example|\/secret\/profile|Profile 1/,
    );
  });

  it("omits config secrets and browser profile details from browser helper JSON", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-browser-"));
    const mockConfig = path.join(tmp, "config.yaml");
    const profilePath = path.join(tmp, SENTINEL_PROFILE_DIR);
    const mockBrowser = path.join(tmp, "mock-browser");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "if (process.argv.includes('diagnose')) {",
        `  ${mockResultLine("diagnose", "succeeded", {
          diagnostics: [{
            code: "browser_diagnostic",
            severity: "info",
            message: "Browser binary is executable",
          }],
        })}`,
        "  process.exit(0);",
        "}",
        "process.exit(2);",
      ],
    );
    await fs.writeFile(mockBrowser, "#!/usr/bin/env node\n", "utf8");
    await fs.chmod(mockBrowser, 0o700);
    await fs.writeFile(
      mockConfig,
      [
        "login:",
        `  username: ${SENTINEL_USER}`,
        `  password: ${SENTINEL_PASSWORD}`,
        `cookie: ${SENTINEL_COOKIE}`,
        `token: ${SENTINEL_TOKEN}`,
        "browser:",
        "  arguments:",
        `    - --user-data-dir=${JSON.stringify(profilePath)}`,
        "  binary_location: \"\"",
        "  extensions: []",
        "  use_private_window: true",
        `  user_data_dir: ${JSON.stringify(profilePath)}`,
        `  profile_name: ${JSON.stringify(SENTINEL_PROFILE_NAME)}`,
      ].join("\n"),
      "utf8",
    );

    const config = withMockMiniclawScript(mockCli, {
      configPath: mockConfig,
      workingDirectory: tmp,
    });
    const status = await getKleinanzeigenBrowserStatus(config);
    const configured = await configureKleinanzeigenBrowser(
      {
        confirm: true,
        browser: "auto",
        usePrivateWindow: false,
        profileMode: "workspace",
      },
      config,
    );
    const checked = await checkKleinanzeigenBrowser(
      {
        binaryLocation: mockBrowser,
        allowUnsupportedBrowser: true,
        profileMode: "custom",
        userDataDir: profilePath,
        profileName: SENTINEL_PROFILE_NAME,
      },
      config,
    );

    assert.equal(
      status.browser.configured.userDataDir,
      "[configured-profile-dir]",
    );
    assert.equal(
      status.browser.configured.profileName,
      "[configured-profile]",
    );
    assert.equal(
      checked.browser.configured.userDataDir,
      "[configured-profile-dir]",
    );
    assert.equal(
      checked.browser.configured.profileName,
      "[configured-profile]",
    );
    assertJsonOmits(
      [status, configured, checked],
      sentinelNeedles({ profilePath }),
    );
  });

  it("rejects custom browser settings for persistent config changes", async () => {
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
          {
            confirm: true,
            binaryLocation: mockBrave,
            allowUnsupportedBrowser: true,
          },
          withCommandRunner({ configPath: mockConfig, workingDirectory: tmp }),
        ),
      /binaryLocation, allowUnsupportedBrowser cannot be changed/,
    );
    await assert.rejects(
      () =>
        configureKleinanzeigenBrowser(
          { confirm: true, profileMode: "custom", userDataDir: "profile" },
          withCommandRunner({ configPath: mockConfig, workingDirectory: tmp }),
        ),
      /userDataDir cannot be changed/,
    );
    await assert.rejects(
      () =>
        configureKleinanzeigenBrowser(
          { confirm: true, profileName: "Default" },
          withCommandRunner({ configPath: mockConfig, workingDirectory: tmp }),
        ),
      /profileName requires profileMode system-default/,
    );
  });

  it("checks a browser through miniclaw diagnostics without changing config", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-browser-"));
    const mockConfig = path.join(tmp, "config.yaml");
    const mockBrowser = path.join(tmp, "mock-browser");
    const mockCli = await writeExecutableMockScript(
      path.join(tmp, "mock-cli.mjs"),
      [
        "#!/usr/bin/env node",
        "if (process.argv.includes('diagnose')) {",
        `  ${mockResultLine("diagnose", "succeeded", {
          diagnostics: [{
            code: "browser_diagnostic",
            severity: "info",
            message: "Browser binary is executable",
          }],
        })}`,
        "  process.exit(0);",
        "}",
        "process.exit(2);",
      ],
    );
    await fs.writeFile(
      mockBrowser,
      "#!/usr/bin/env node\nconsole.log('Mock Browser 1.0')\n",
      "utf8",
    );
    await fs.chmod(mockBrowser, 0o700);
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
