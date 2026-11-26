import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import {
  fillLoginDataAndSend,
  getLoginState,
  IpRangeBlockedError,
  login,
  LoginDetectionReason,
  ManualActionRequiredError,
} from "../dist/auth.js";
import { Config } from "../dist/model/config-model.js";
import { By } from "../dist/web-primitives.js";

describe("miniclaw auth", () => {
  it("stops before login actions when the IP range is blocked", async () => {
    const pageText = await fs.readFile(
      new URL("fixtures/auth-ip-range-blocked-page.txt", import.meta.url),
      "utf8",
    );
    let openCalls = 0;
    const controller = {
      page: { url: "about:blank" },
      async webOpen(url) {
        openCalls += 1;
        this.page.url = url;
      },
      async webExecute() {
        return pageText;
      },
      async webClick() {
        assert.fail("blocked page must stop before clicks");
      },
      async webInput() {
        assert.fail("blocked page must stop before credential input");
      },
      async webProbe() {
        assert.fail("blocked page must stop before login probes");
      },
      async webSleep() {},
      async webText() {
        assert.fail("blocked page must stop before login text lookup");
      },
    };

    await assert.rejects(
      () => login(
        controller,
        { username: "user@example.invalid", password: "secret" },
        { quickDomTimeout: 0.1 },
      ),
      (error) => {
        assert.ok(error instanceof IpRangeBlockedError);
        assert.match(error.message, /temporarily blocked this network or IP range/i);
        return true;
      },
    );
    assert.equal(openCalls, 1);
  });

  it("uses the single-attempt selector-group helper for login probes", async () => {
    const helperCalls = [];
    const controller = {
      page: { url: "https://www.kleinanzeigen.de/" },
      async webTextFirstAvailable() {
        throw new Error("legacy helper should not be used");
      },
      async webTextFirstAvailableOnce(selectors, options = {}) {
        helperCalls.push({ options, selectors });
        return ["User user@example.test", 1];
      },
    };

    const result = await getLoginState(
      controller,
      new Config({ login: { username: "user@example.test" } }).login,
      { quickDomTimeout: 0.1 },
    );

    assert.equal(result.isLoggedIn, true);
    assert.equal(result.reason, LoginDetectionReason.USER_INFO_MATCH);
    assert.equal(helperCalls.length, 1);
    assert.equal(helperCalls[0].options.key, "quickDom");
    assert.equal(helperCalls[0].options.timeout, 0.1);
  });

  it("reads the login marker through textContent and treats stale nodes as a miss", async () => {
    const seen = [];
    const hiddenHeader = {
      page: { url: "https://www.kleinanzeigen.de/" },
      async webTextFirstAvailableOnce(selectors, options = {}) {
        seen.push(options.fallbackToTextContent);
        return ["angemeldet als: user@example.test", 0];
      },
    };
    const visible = await getLoginState(
      hiddenHeader,
      new Config({ login: { username: "user@example.test" } }).login,
      { quickDomTimeout: 0.1 },
    );
    assert.equal(visible.isLoggedIn, true);
    assert.deepEqual(seen, [true]);

    const rerendering = {
      page: { url: "https://www.kleinanzeigen.de/" },
      async webTextFirstAvailableOnce(selectors) {
        if (selectors.some(([, value]) => value === "mr-medium")) {
          throw new Error("Could not find node with given id");
        }
        return ["Einloggen", 0];
      },
    };
    const stale = await getLoginState(
      rerendering,
      new Config({ login: { username: "user@example.test" } }).login,
      { quickDomTimeout: 0.1 },
    );
    assert.equal(stale.isLoggedIn, false);
    assert.equal(stale.reason, LoginDetectionReason.CTA_MATCH);
  });

  it("submits the e-mail step again once the captcha token appears", async () => {
    const { clicks, controller } = identifierController({ tokenAfter: 1 });

    await fillLoginDataAndSend(controller, CREDENTIALS, FAST);

    assert.deepEqual(clicks, ["identifier", "identifier", "password"]);
    assert.ok(controller.selectors.every((selector) => selector === AUTH0_SUBMIT));
  });

  it("hands an unresolved identifier captcha to the user", async () => {
    const expected = new Error("manual captcha boundary");
    let manualCalls = 0;
    const { clicks, controller } = identifierController({ tokenAfter: Infinity });

    await assert.rejects(
      () => fillLoginDataAndSend(controller, CREDENTIALS, {
        ...FAST,
        onManualCaptcha: () => {
          manualCalls += 1;
          throw expected;
        },
      }),
      expected,
    );
    assert.equal(manualCalls, 1);
    assert.deepEqual(clicks, ["identifier"]);

    const fresh = identifierController({ tokenAfter: Infinity });
    await assert.rejects(
      () => fillLoginDataAndSend(fresh.controller, CREDENTIALS, FAST),
      (error) => error instanceof ManualActionRequiredError,
    );
  });

  it("continues on the password step after the user solved the captcha", async () => {
    let manualCalls = 0;
    const { clicks, controller } = identifierController({ tokenAfter: Infinity });

    await fillLoginDataAndSend(controller, CREDENTIALS, {
      ...FAST,
      onManualCaptcha: () => {
        manualCalls += 1;
        controller.page.url = "https://login.kleinanzeigen.de/u/login/password";
      },
    });

    assert.equal(manualCalls, 1);
    assert.deepEqual(clicks, ["identifier", "password"]);
  });
});

const AUTH0_SUBMIT =
  "button[type='submit'][data-action-button-primary='true']" +
  ":not([disabled]):not([aria-disabled='true'])";
const CREDENTIALS = { username: "user@example.invalid", password: "secret" };
const FAST = { captchaDetectionTimeout: 0.05, pollIntervalMs: 1, quickDomTimeout: 0.05 };

// Auth0 identifier page with a captcha whose token appears after N checks.
function identifierController({ tokenAfter }) {
  const clicks = [];
  let tokenChecks = 0;
  const controller = {
    page: { url: "https://login.kleinanzeigen.de/u/login/identifier" },
    selectors: [],
    async webClick(type, value) {
      this.selectors.push(value);
      if (this.page.url.includes("/identifier")) {
        clicks.push("identifier");
        if (tokenChecks > tokenAfter) {
          this.page.url = "https://login.kleinanzeigen.de/u/login/password";
        }
        return;
      }
      clicks.push("password");
      this.page.url = "https://www.kleinanzeigen.de/";
    },
    async webExecute() {
      tokenChecks += 1;
      return tokenChecks > tokenAfter;
    },
    async webInput() {},
    async webProbe(type) {
      return type === By.CSS_SELECTOR && this.page.url.includes("/identifier") ? {} : null;
    },
    async webSleep() {},
    async webText() {
      return "";
    },
  };
  return { clicks, controller };
}
