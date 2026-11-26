// Cases recovered from the standalone miniclaw 0.1.0 test suite.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  LiveBrowserSessionDisabledError,
  createBrowserSession,
} from "../dist/browser-session.js";
import { buildBrowserSessionPlan } from "../dist/browser/browser-session-plan.js";
import { Config } from "../dist/model/config-model.js";

async function makeExecutableBrowser(tmp) {
  const browserPath = path.join(tmp, "chrome");
  await fs.writeFile(browserPath, "#!/bin/sh\nexit 0\n", "utf8");
  await fs.chmod(browserPath, 0o700);
  return browserPath;
}

function fakeContext({ pages = [] } = {}) {
  const calls = { close: 0, newPage: 0 };
  const newPage = { id: "new-page" };
  return {
    calls,
    context: {
      pages: () => pages,
      newPage: async () => {
        calls.newPage += 1;
        return newPage;
      },
      close: async () => {
        calls.close += 1;
      },
      browser: () => null,
    },
    newPage,
  };
}

function refusingDriver(reason) {
  return {
    connectCdpBrowser: async () => {
      throw new Error(`should not connect: ${reason}`);
    },
    launchBrowser: async () => {
      throw new Error(`should not launch: ${reason}`);
    },
  };
}

async function withTmp(prefix, run) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await run(tmp);
  } finally {
    await fs.rm(tmp, { force: true, recursive: true });
  }
}

describe("miniclaw browser session", () => {
  it("requires the explicit live-browser gate before any side effect", async () => {
    await withTmp("miniclaw-session-gate-", async (tmp) => {
      const config = new Config({
        browser: {
          binary_location: await makeExecutableBrowser(tmp),
          user_data_dir: path.join(tmp, "profile"),
        },
      });
      const plan = buildBrowserSessionPlan(config);

      await assert.rejects(
        () => createBrowserSession(plan, { driver: refusingDriver("gate closed") }),
        LiveBrowserSessionDisabledError,
      );
      await assert.rejects(() => fs.stat(plan.preferencesFile), /ENOENT/);
    });
  });

  it("connects to an approved loopback debugging browser", async () => {
    await withTmp("miniclaw-session-cdp-", async (tmp) => {
      const existingPage = { id: "existing-page" };
      const contextBundle = fakeContext({ pages: [existingPage] });
      let browserClosed = 0;
      const calls = [];
      const driver = {
        connectCdpBrowser: async (endpoint, options) => {
          calls.push({ endpoint, options });
          return {
            contexts: () => [contextBundle.context],
            close: async () => {
              browserClosed += 1;
            },
          };
        },
        launchBrowser: refusingDriver("remote plan").launchBrowser,
      };

      const session = await createBrowserSession(
        new Config({
          browser: {
            binary_location: await makeExecutableBrowser(tmp),
            arguments: [
              "--remote-debugging-host=127.0.0.1",
              "--remote-debugging-port=9333",
            ],
          },
        }),
        { allowLiveBrowser: true, driver, timeout: 7 },
      );

      assert.equal(session.mode, "connect");
      assert.equal(session.page, existingPage);
      assert.deepEqual(calls, [{
        endpoint: "http://127.0.0.1:9333",
        options: { timeout: 7000 },
      }]);
      await session.close();
      assert.equal(browserClosed, 1);
      assert.equal(contextBundle.calls.close, 0);
    });
  });

  it("launches an approved persistent context with profile prefs", async () => {
    await withTmp("miniclaw-session-launch-", async (tmp) => {
      const browserPath = await makeExecutableBrowser(tmp);
      const userDataDir = path.join(tmp, "profile");
      const contextBundle = fakeContext();
      const calls = [];
      const driver = {
        connectCdpBrowser: refusingDriver("launch plan").connectCdpBrowser,
        launchBrowser: async (plan, options) => {
          calls.push({ options, plan });
          return contextBundle.context;
        },
      };

      const session = await createBrowserSession(
        new Config({
          browser: {
            binary_location: browserPath,
            profile_name: "Profile 1",
            user_data_dir: userDataDir,
            arguments: ["--disable-gpu", "--no-sandbox"],
          },
        }),
        { allowLiveBrowser: true, driver, timeout: 11 },
      );

      assert.equal(session.mode, "launch");
      assert.equal(session.page, contextBundle.newPage);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].plan.userDataDir, userDataDir);
      assert.equal(calls[0].plan.browserExecutablePath, browserPath);
      assert.equal(calls[0].plan.sandbox, false);
      assert.equal(calls[0].options.timeout, 11000);
      assert.ok(calls[0].plan.browserArgs.includes("--disable-gpu"));

      const prefs = JSON.parse(
        await fs.readFile(path.join(userDataDir, "Profile 1", "Preferences"), "utf8"),
      );
      assert.equal(prefs.credentials_enable_service, false);
      assert.equal(prefs.profile.default_content_setting_values.notifications, 2);

      await session.close();
      assert.equal(contextBundle.calls.close, 1);
    });
  });

  it("skips profile prefs when the caller opts out", async () => {
    await withTmp("miniclaw-session-skip-", async (tmp) => {
      const userDataDir = path.join(tmp, "profile");
      const contextBundle = fakeContext();
      const session = await createBrowserSession(
        new Config({
          browser: {
            binary_location: await makeExecutableBrowser(tmp),
            user_data_dir: userDataDir,
          },
        }),
        {
          allowLiveBrowser: true,
          driver: {
            connectCdpBrowser: refusingDriver("launch plan").connectCdpBrowser,
            launchBrowser: async () => contextBundle.context,
          },
          ensureProfilePrefs: false,
        },
      );

      await session.close();
      await assert.rejects(
        () => fs.stat(path.join(userDataDir, "Default", "Preferences")),
        /ENOENT/,
      );
    });
  });
});
