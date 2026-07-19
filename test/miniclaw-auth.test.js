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
} from "../miniclaw/dist/auth.js";
import { Config } from "../miniclaw/dist/model/config-model.js";
import { By } from "../miniclaw/dist/web-primitives.js";

describe("miniclaw auth", () => {
  it("stops before login actions when the IP range is blocked", async () => {
    const pageText = await fs.readFile(
      new URL("fixtures/ip-range-blocked-page.txt", import.meta.url),
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

  it("stops at captcha before submitting the username step", async () => {
    const expected = new Error("manual captcha boundary");
    let manualCaptchaCalls = 0;
    let submitClicks = 0;
    const controller = {
      page: { url: "https://login.kleinanzeigen.de/u/login/identifier" },
      async webInput(type, value, text) {
        assert.equal(type, By.ID);
        assert.equal(value, "username");
        assert.equal(text, "user@example.invalid");
      },
      async webClick() {
        submitClicks += 1;
      },
      async webProbe(type) {
        if (type === By.CSS_SELECTOR) {
          return {};
        }
        return null;
      },
      async webSleep() {},
      async webText() {
        return "";
      },
    };

    await assert.rejects(
      () => fillLoginDataAndSend(
        controller,
        { username: "user@example.invalid", password: "secret" },
        {
          captchaDetectionTimeout: 0.1,
          onManualCaptcha: () => {
            manualCaptchaCalls += 1;
            throw expected;
          },
        },
      ),
      expected,
    );
    await assert.rejects(
      () => fillLoginDataAndSend(
        controller,
        { username: "user@example.invalid", password: "secret" },
        { captchaDetectionTimeout: 0.1 },
      ),
      (error) => error instanceof ManualActionRequiredError,
    );

    assert.equal(manualCaptchaCalls, 1);
    assert.equal(submitClicks, 0);
  });

  it("does not submit username again if captcha reaches password step", async () => {
    let manualCaptchaCalls = 0;
    let usernameSubmitClicks = 0;
    let passwordSubmitClicks = 0;
    const controller = {
      page: { url: "https://login.kleinanzeigen.de/u/login/identifier" },
      async webInput(type, value, text) {
        if (value === "username") {
          assert.equal(type, By.ID);
          assert.equal(text, "user@example.invalid");
          return;
        }
        assert.equal(type, By.CSS_SELECTOR);
        assert.equal(value, "input[type='password']");
        assert.equal(text, "secret");
      },
      async webClick() {
        if (this.page.url.includes("/identifier")) {
          usernameSubmitClicks += 1;
          return;
        }
        passwordSubmitClicks += 1;
        this.page.url = "https://www.kleinanzeigen.de/";
      },
      async webProbe(type) {
        if (
          type === By.CSS_SELECTOR &&
            this.page.url.includes("/identifier")
        ) {
          return {};
        }
        return null;
      },
      async webSleep() {},
      async webText() {
        return "";
      },
    };

    await fillLoginDataAndSend(
      controller,
      { username: "user@example.invalid", password: "secret" },
      {
        captchaDetectionTimeout: 0.1,
        onManualCaptcha: () => {
          manualCaptchaCalls += 1;
          controller.page.url = "https://login.kleinanzeigen.de/u/login/password";
        },
      },
    );

    assert.equal(manualCaptchaCalls, 1);
    assert.equal(usernameSubmitClicks, 0);
    assert.equal(passwordSubmitClicks, 1);
  });
});
