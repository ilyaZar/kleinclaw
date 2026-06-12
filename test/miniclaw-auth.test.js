import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fillLoginDataAndSend } from "../miniclaw/dist/auth.js";
import { By } from "../miniclaw/dist/web-primitives.js";

describe("miniclaw auth", () => {
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
