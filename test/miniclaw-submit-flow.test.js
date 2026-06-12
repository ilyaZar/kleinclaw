import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { submitAdForm } from "../miniclaw/dist/publish-form.js";
import { By } from "../miniclaw/dist/web-primitives.js";

describe("miniclaw submit flow", () => {
  it("declines the paid visibility upsell before waiting for confirmation", async () => {
    const clicked = [];
    let currentUrl = "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html";
    let upsellProbeCount = 0;
    const controller = {
      async webClick(type, value) {
        clicked.push({ type, value });
      },
      async webExecute(script) {
        if (script === "window.location.href") {
          return currentUrl;
        }
        if (script === "document.referrer") {
          return "";
        }
        return "";
      },
      async webProbe(type, value) {
        if (
          type === By.XPATH &&
          value === '//button[contains(., "Ohne Hochschieben weiter")]'
        ) {
          upsellProbeCount += 1;
          return {
            async click() {
              clicked.push({ type, value: "skip-paid-visibility" });
              currentUrl =
                "https://www.kleinanzeigen.de/" +
                "p-anzeige-aufgeben-bestaetigung.html?adId=3431202334";
            },
          };
        }
        return null;
      },
      async webSleep() {},
    };

    const adId = await submitAdForm(controller, { images: ["image.jpg"] }, {
      confirmationTimeout: 1,
      quickDomTimeout: 0,
    });

    assert.equal(adId, 3431202334);
    assert.equal(upsellProbeCount, 1);
    assert.equal(
      clicked.some((event) => event.value === "skip-paid-visibility"),
      true,
    );
  });
});
