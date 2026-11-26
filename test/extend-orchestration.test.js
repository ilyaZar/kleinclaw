import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  daysUntilEndDate,
  parseGermanDate,
  runExtendAdsBatch,
} from "../dist/extend-orchestration.js";
import {
  extendPublishedAd,
} from "../dist/publish-side-effects/publish-side-effects-extend-hook.js";
import { By, TimeoutError } from "../dist/web-primitives.js";

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

// Fake manage-ads page: the choice-dialog script answers from scripted states.
function extendController({ afterClick = [], afterConfirm = [], button = true } = {}) {
  const events = [];
  let states = ["none"];
  const controller = {
    async webAwait(condition, { timeout } = {}) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await condition();
        if (result) {
          return result;
        }
      }
      throw new TimeoutError(`condition not met within ${timeout}`);
    },
    async webClick(type, value) {
      assert.equal(value, 'button[aria-label="Schlie\u00dfen"]');
      events.push("close");
    },
    async webExecute(js) {
      assert.match(js, /Nur verl\u00e4ngern/);
      if (js.includes('("select"')) {
        events.push("select");
        return "selected";
      }
      if (js.includes('("confirm"')) {
        events.push("confirm");
        states = afterConfirm;
        return "clicked";
      }
      const state = states[0] ?? "none";
      if (events.at(-1) !== `state:${state}`) {
        events.push(`state:${state}`);
      }
      return state;
    },
    async webFind(type, value, options = {}) {
      events.push({ options, type, value });
      if (type === By.ID && value === "my-manageitems-adlist") {
        return {};
      }
      if (button && type === By.XPATH && value.includes("data-adid=\"12345\"")) {
        return {
          async click() {
            events.push("clicked-extend");
            states = afterClick;
          },
        };
      }
      throw new TimeoutError(`unexpected selector: ${type} ${value}`);
    },
    async webFindAll() {
      return [];
    },
    async webOpen(url) {
      events.push(`open:${url}`);
    },
    async webScrollPageDown() {},
    async webSleep() {},
  };
  return { controller, events };
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

  it("confirms only the free option in the extension choice dialog", async () => {
    const { controller, events } = extendController({
      afterClick: ["choice"],
      afterConfirm: ["success"],
    });

    const extended = await extendPublishedAd(
      controller,
      "https://www.kleinanzeigen.de",
      loadedAd(),
      { confirmationTimeout: 1, quickDomTimeout: 0.25 },
    );

    assert.equal(extended, true);
    assert.deepEqual(events.filter((event) => typeof event === "string"), [
      "open:https://www.kleinanzeigen.de/m-meine-anzeigen.html?pageNumber=1&keyword=",
      "state:none",
      "clicked-extend",
      "state:choice",
      "select",
      "confirm",
      "state:success",
      "close",
    ]);
  });

  it("does not count a dialog that closes without a success message", async () => {
    const { controller, events } = extendController({
      afterClick: ["choice"],
      afterConfirm: ["none"],
    });

    const extended = await extendPublishedAd(
      controller,
      "https://www.kleinanzeigen.de",
      loadedAd(),
      { confirmationTimeout: 1, quickDomTimeout: 0.25 },
    );

    assert.equal(extended, false);
    assert.ok(events.includes("confirm"));
    assert.ok(events.includes("close"));
  });

  it("accepts the classic direct extension success dialog", async () => {
    const { controller, events } = extendController({ afterClick: ["success"] });

    const extended = await extendPublishedAd(
      controller,
      "https://www.kleinanzeigen.de",
      loadedAd(),
      { confirmationTimeout: 1, quickDomTimeout: 0.25 },
    );

    assert.equal(extended, true);
    assert.equal(events.includes("select"), false);
  });

  it("reports a missing extend button as not extended", async () => {
    const { controller, events } = extendController({ button: false });

    const extended = await extendPublishedAd(
      controller,
      "https://www.kleinanzeigen.de",
      loadedAd(),
      { confirmationTimeout: 1, quickDomTimeout: 0.25 },
    );

    assert.equal(extended, false);
    assert.equal(events.includes("clicked-extend"), false);
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
