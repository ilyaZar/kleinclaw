import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  daysUntilEndDate,
  parseGermanDate,
  runExtendAdsBatch,
} from "../miniclaw/dist/extend-orchestration.js";
import { extendPublishedAd } from "../miniclaw/dist/publish-side-effects/extend-hook.js";
import { By, TimeoutError } from "../miniclaw/dist/web-primitives.js";

function loadedAd({ id = 12345, title = "Eligible ad" } = {}) {
  return {
    ad: {
      id,
      title,
      updatedOn: null,
    },
    filePath: "ads/eligible/ad.yaml",
    raw: { id, title },
    relativePath: "ads/eligible/ad.yaml",
  };
}

describe("miniclaw extend orchestration", () => {
  it("matches Python's UTC date comparison near local midnight", () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "Europe/Berlin";
      const endDate = parseGermanDate("21.06.2026");

      assert.notEqual(endDate, null);
      assert.equal(endDate.getUTCFullYear(), 2026);
      assert.equal(endDate.getUTCMonth(), 5);
      assert.equal(endDate.getUTCDate(), 21);
      assert.equal(
        daysUntilEndDate(endDate, new Date("2026-06-12T22:30:00Z")),
        9,
      );
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });

  it("clicks the Python extend button XPath and closes the dialog", async () => {
    const events = [];
    const context = {
      ad: { id: 12345, title: "Eligible ad" },
      adFile: "ads/eligible/ad.yaml",
      publishedAd: { id: 12345, state: "active" },
      raw: {},
      relativePath: "ads/eligible/ad.yaml",
    };
    const controller = {
      async webClick(type, value, timeout) {
        events.push({ timeout, type, value });
      },
      async webFind(type, value, options = {}) {
        events.push({ options, type, value });
        if (type === By.ID && value === "my-manageitems-adlist") {
          return {};
        }
        if (type === By.XPATH && value.includes("Verl\u00e4ngern")) {
          assert.equal(
            value,
            '//li[@data-adid="12345"]//button[contains(., "Verl\u00e4ngern")]',
          );
          return {
            async click() {
              events.push("clicked-extend");
            },
          };
        }
        throw new TimeoutError(`unexpected selector: ${type} ${value}`);
      },
      async webFindAll() {
        events.push("find-next");
        return [];
      },
      async webOpen(url) {
        events.push(`open:${url}`);
      },
      async webScrollPageDown() {
        events.push("scroll");
      },
      async webSleep() {},
    };

    const extended = await extendPublishedAd(
      controller,
      "https://www.kleinanzeigen.de",
      context,
      {
        paginationFollowUpTimeout: 0.4,
        paginationInitialTimeout: 0.5,
        quickDomTimeout: 0.25,
      },
    );

    assert.equal(extended, true);
    assert.deepEqual(events, [
      "open:https://www.kleinanzeigen.de/m-meine-anzeigen.html",
      { options: {}, type: By.ID, value: "my-manageitems-adlist" },
      "find-next",
      "scroll",
      {
        options: { timeout: 0.25 },
        type: By.XPATH,
        value:
          '//li[@data-adid="12345"]//button[contains(., "Verl\u00e4ngern")]',
      },
      "clicked-extend",
      {
        timeout: 0.25,
        type: By.CSS_SELECTOR,
        value: 'button[aria-label="Schlie\u00dfen"]',
      },
    ]);
  });

  it("treats metadata save failure as a failed extension", async () => {
    const entry = loadedAd();
    let saveCalls = 0;
    let sleepCalls = 0;

    const result = await runExtendAdsBatch([entry], {
      extendAd: async () => true,
      now: new Date("2026-06-12T12:00:00Z"),
      publishedAds: [{
        endDate: "19.06.2026",
        id: 12345,
        state: "active",
      }],
      saveAdConfig: async () => {
        saveCalls += 1;
        throw new Error("disk full");
      },
      sleep: async () => {
        sleepCalls += 1;
      },
    });

    assert.equal(saveCalls, 1);
    assert.equal(sleepCalls, 1);
    assert.equal(result.attempted, 1);
    assert.equal(result.extended, 0);
    assert.equal(result.skipped, 0);
    assert.equal(entry.raw.updated_on, "2026-06-12T12:00:00+00:00");
    assert.deepEqual(result.events, [{
      adFile: "ads/eligible/ad.yaml",
      adId: 12345,
      daysUntilExpiry: 7,
      relativePath: "ads/eligible/ad.yaml",
      status: "failed",
      title: "Eligible ad",
    }]);
  });
});
