import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  browserCandidatePaths,
  buildBrowserSessionPlan,
  getCompatibleBrowser,
} from "../../miniclaw/dist/browser/browser-session-plan.js";
import {
  remoteDebuggingPortFromArguments,
} from "../../miniclaw/dist/browser/browser-arguments.js";
import {
  CdpContext,
  CdpPage,
  launchCdpBrowser,
} from "../../miniclaw/dist/browser/cdp-adapter.js";
import { Config } from "../../miniclaw/dist/model/config-model.js";

export async function runCdpBrowserPageCases() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kleinclaw-cdp-plan-"));
  const fakeBrowser = path.join(tmp, "chromium");
  const workspaceProfile = path.join(tmp, ".temp", "browser-profile");
  const relativeExtension = path.join("extensions", "helper.crx");
  const binA = path.join(tmp, "bin-a");
  const binB = path.join(tmp, "bin-b");
  const detectedChromium = path.join(binB, "chromium");
  const detectedChrome = path.join(binA, "google-chrome");
  const createCdpTestPage = (id, send, { on = () => () => {} } = {}) => {
    const page = new CdpPage("http://127.0.0.1:1", {
      id,
      type: "page",
      url: "about:blank",
      webSocketDebuggerUrl: `ws://127.0.0.1:1/devtools/page/${id}`,
    }, 1);
    page.client = {
      close: () => {},
      connect: async () => {},
      on,
      send,
    };
    return page;
  };

  await fs.writeFile(fakeBrowser, "#!/bin/sh\nexit 0\n", "utf8");
  await fs.chmod(fakeBrowser, 0o700);
  await fs.mkdir(binA);
  await fs.mkdir(binB);
  await fs.writeFile(detectedChrome, "#!/bin/sh\nexit 0\n", "utf8");
  await fs.writeFile(detectedChromium, "#!/bin/sh\nexit 0\n", "utf8");
  await fs.chmod(detectedChrome, 0o700);
  await fs.chmod(detectedChromium, 0o700);

  assert.equal(
    getCompatibleBrowser({
      platform: "linux",
      searchPath: [binA, binB].join(path.delimiter),
    }),
    detectedChromium,
  );
  assert.deepEqual(
    browserCandidatePaths({
      env: {
        LOCALAPPDATA: "LocalAppData",
        PROGRAMFILES: "ProgramFiles",
        "PROGRAMFILES(X86)": "ProgramFilesX86",
      },
      platform: "win32",
      searchPath: "",
    }).slice(0, 12),
    [
      path.win32.join(
        "LocalAppData",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      path.win32.join(
        "ProgramFiles",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      path.win32.join(
        "ProgramFilesX86",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      path.win32.join(
        "LocalAppData",
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      ),
      path.win32.join(
        "ProgramFiles",
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      ),
      path.win32.join(
        "ProgramFilesX86",
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      ),
      path.win32.join(
        "LocalAppData",
        "Chromium",
        "Application",
        "chrome.exe",
      ),
      path.win32.join(
        "ProgramFiles",
        "Chromium",
        "Application",
        "chrome.exe",
      ),
      path.win32.join(
        "ProgramFilesX86",
        "Chromium",
        "Application",
        "chrome.exe",
      ),
      path.win32.join(
        "ProgramFiles",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      path.win32.join(
        "ProgramFilesX86",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      path.win32.join(
        "LocalAppData",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
    ],
  );
  assert.throws(
    () => getCompatibleBrowser({ platform: "plan9", searchPath: "" }),
    /Installed browser for OS plan9 could not be detected/,
  );
  assert.throws(
    () => buildBrowserSessionPlan(
      new Config({
        browser: {
          arguments: ["--remote-debugging-port=9333"],
          binary_location: path.join(tmp, "missing-browser"),
        },
      }),
      { cwd: tmp, defaultUserDataDir: workspaceProfile },
    ),
    /Specified browser binary .*missing-browser.* does not exist/,
  );
  assert.throws(
    () => remoteDebuggingPortFromArguments([
      "--remote-debugging-port=abc",
    ]),
    /Invalid --remote-debugging-port value: abc/,
  );
  assert.throws(
    () => buildBrowserSessionPlan(
      new Config({
        browser: {
          arguments: [
            "--remote-debugging-host=0.0.0.0",
            "--remote-debugging-port=9333",
          ],
          binary_location: fakeBrowser,
        },
      }),
      { cwd: tmp, defaultUserDataDir: workspaceProfile },
    ),
    /Invalid --remote-debugging-host value: 0\.0\.0\.0/,
  );
  assert.equal(
    remoteDebuggingPortFromArguments(["--remote-debugging-port=0"]),
    null,
  );

  const plan = buildBrowserSessionPlan(
    new Config({
      browser: {
        arguments: ["--disable-dev-shm-usage"],
        binary_location: fakeBrowser,
        extensions: [relativeExtension],
        profile_name: "Profile 1",
        user_data_dir: "",
      },
    }),
    { cwd: tmp, defaultUserDataDir: workspaceProfile },
  );

  assert.equal(plan.mode, "launch");
  assert.equal(plan.browserExecutablePath, fakeBrowser);
  assert.equal(plan.userDataDir, workspaceProfile);
  assert.equal(plan.profileDir, path.join(workspaceProfile, "Profile 1"));
  assert.equal(
    plan.preferencesFile,
    path.join(workspaceProfile, "Profile 1", "Preferences"),
  );
  assert.deepEqual(plan.extensionPaths, [path.join(tmp, relativeExtension)]);
  assert.equal(plan.browserArgs.includes("--disable-dev-shm-usage"), true);
  assert.equal(
    plan.browserArgs.some((arg) => arg.startsWith("--user-data-dir=")),
    false,
  );
  assert.equal(plan.remotePort, null);

  const remotePlan = buildBrowserSessionPlan(
    new Config({
      browser: {
        arguments: [
          "--remote-debugging-host=127.0.0.1",
          "--remote-debugging-port=9333",
        ],
        binary_location: fakeBrowser,
        extensions: [path.join("extensions", "remote-ignored.crx")],
        profile_name: "Remote Profile",
        user_data_dir: path.join(tmp, "remote-profile"),
      },
    }),
    { cwd: tmp, defaultUserDataDir: workspaceProfile },
  );

  assert.equal(remotePlan.mode, "connect");
  assert.equal(remotePlan.remoteHost, "127.0.0.1");
  assert.equal(remotePlan.remotePort, 9333);
  assert.deepEqual(remotePlan.browserArgs, []);
  assert.equal(remotePlan.userDataDir, null);
  assert.equal(remotePlan.profileDir, null);
  assert.equal(remotePlan.preferencesFile, null);
  assert.deepEqual(remotePlan.extensionPaths, []);

  const disposedInitialPages = [];
  const closedInitialPages = [];
  const existingPage = {
    dispose: async () => disposedInitialPages.push("existing"),
    close: async () => closedInitialPages.push("existing"),
  };
  const context = new CdpContext(
    "http://127.0.0.1:1",
    1,
    null,
    [existingPage],
  );

  assert.deepEqual(context.pages(), [existingPage]);
  await context.close();
  assert.deepEqual(disposedInitialPages, ["existing"]);
  assert.deepEqual(closedInitialPages, []);

  const handlers = new Map();
  let currentHref = "https://www.kleinanzeigen.de/s-home.html";
  const trackedPage = createCdpTestPage(
    "page-1",
    async (method, params = {}) => {
      if (method === "Runtime.evaluate") {
        const expression = String(params.expression ?? "");
        if (expression === "document.readyState") {
          return { result: { value: "complete" } };
        }
        if (expression === "location.href") {
          return { result: { value: currentHref } };
        }
      }
      return {};
    },
    {
      on: (method, handler) => {
        handlers.set(method, handler);
        return () => handlers.delete(method);
      },
    },
  );

  await trackedPage.init();
  assert.equal(trackedPage.url, "https://www.kleinanzeigen.de/s-home.html");
  handlers.get("Page.frameNavigated")({
    frame: {
      parentId: "main",
      url: "https://www.kleinanzeigen.de/ignored-child-frame",
    },
  });
  assert.equal(trackedPage.url, "https://www.kleinanzeigen.de/s-home.html");
  handlers.get("Page.frameNavigated")({
    frame: { url: "https://login.kleinanzeigen.de/u/login" },
  });
  assert.equal(trackedPage.url, "https://login.kleinanzeigen.de/u/login");
  handlers.get("Page.navigatedWithinDocument")({
    url: "https://login.kleinanzeigen.de/u/login/password",
  });
  assert.equal(
    trackedPage.url,
    "https://login.kleinanzeigen.de/u/login/password",
  );
  currentHref = "https://www.kleinanzeigen.de/m-meine-anzeigen.html";
  await trackedPage.waitForLoadState("load");
  assert.equal(
    trackedPage.url,
    "https://www.kleinanzeigen.de/m-meine-anzeigen.html",
  );

  const navHandlers = new Map();
  const navCalls = [];
  const navPage = createCdpTestPage(
    "page-nav",
    async (method, params = {}) => {
      navCalls.push([method, params]);
      if (method === "Runtime.evaluate") {
        return {
          result: {
            value:
              "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
          },
        };
      }
      return {};
    },
    {
      on: (method, handler) => {
        navHandlers.set(method, handler);
        return () => navHandlers.delete(method);
      },
    },
  );

  const navPromise = navPage.goto(
    "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
    { timeout: 1234 },
  );
  await Promise.resolve();
  assert.deepEqual(navCalls, [
    [
      "Page.navigate",
      { url: "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html" },
    ],
  ]);
  navHandlers.get("Page.frameNavigated")({
    frame: {
      url: "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
    },
  });
  await navPromise;
  assert.equal(
    navPage.url,
    "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
  );
  assert.deepEqual(
    navCalls.map(([method, params]) => [
      method,
      params.expression ?? params.url,
    ]),
    [
      [
        "Page.navigate",
        "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html",
      ],
      ["Runtime.evaluate", "location.href"],
    ],
  );

  const evaluatedExpressions = [];
  const evaluatedPage = createCdpTestPage(
    "page-evaluate",
    async (method, params = {}) => {
      if (method === "Runtime.evaluate") {
        evaluatedExpressions.push(params);
        return { result: { value: { ok: true } } };
      }
      return {};
    },
  );

  const evaluated = await evaluatedPage.evaluate(
    ({ requestUrl }) => requestUrl,
    {
      requestHeaders: { "x-csrf-token": "token" },
      requestMethod: "POST",
      requestUrl: "/api/delete",
    },
  );
  assert.deepEqual(evaluated, { ok: true });
  assert.equal(evaluatedExpressions.length, 1);
  assert.equal(evaluatedExpressions[0].awaitPromise, true);
  assert.equal(evaluatedExpressions[0].returnByValue, true);
  assert.match(
    evaluatedExpressions[0].expression,
    /^\(\(\{ requestUrl \}\) => requestUrl\)\(/,
  );
  assert.match(
    evaluatedExpressions[0].expression,
    /"requestUrl":"\/api\/delete"/,
  );
  assert.match(
    evaluatedExpressions[0].expression,
    /"requestMethod":"POST"/,
  );
  assert.match(
    evaluatedExpressions[0].expression,
    /"requestHeaders":\{"x-csrf-token":"token"\}/,
  );

  await assert.rejects(
    () => launchCdpBrowser({
      ...plan,
      extensionPaths: [path.join(tmp, "missing.crx")],
    }),
    /Configured extension-file .*missing\.crx.* does not exist/,
  );

  return { createCdpTestPage, tmp };
}
