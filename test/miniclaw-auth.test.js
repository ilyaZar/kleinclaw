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
});
