import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { navigatePaginatedAdOverview } from "../miniclaw/dist/publish-side-effects/ad-overview.js";
import { TimeoutError, WebController } from "../miniclaw/dist/web-primitives.js";

describe("miniclaw ad overview navigation", () => {
  it("scrolls pages with the same stepped browser script sequence as Python", async () => {
    const scripts = [];
    const sleeps = [];
    const controller = new WebController({
      async evaluate(script) {
        scripts.push(String(script));
        if (script === "document.body.scrollHeight") {
          return 25;
        }
        return undefined;
      },
    }, {
      sleep: async (ms) => sleeps.push(ms),
    });

    await controller.webScrollPageDown(10, 10000, { scrollBackTop: true });

    assert.deepEqual(scripts, [
      "document.body.scrollHeight",
      "window.scrollTo(0, 10)",
      "window.scrollTo(0, 20)",
      "window.scrollTo(0, 30)",
      "window.scrollTo(0, 20)",
      "window.scrollTo(0, 10)",
      "window.scrollTo(0, 0)",
    ]);
    assert.deepEqual(sleeps, [1, 1, 1, 0.5, 0.5, 0.5]);
  });

  it("scrolls the own-ad overview before page actions", async () => {
    const events = [];
    const controller = {
      async webFind() {
        events.push("find-list");
        return {};
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

    const done = await navigatePaginatedAdOverview(
      controller,
      "https://www.kleinanzeigen.de/m-meine-anzeigen.html",
      async (pageNumber) => {
        events.push(`action:${pageNumber}`);
        return true;
      },
    );

    assert.equal(done, true);
    assert.deepEqual(events, [
      "open:https://www.kleinanzeigen.de/m-meine-anzeigen.html",
      "find-list",
      "find-next",
      "scroll",
      "action:1",
    ]);
  });

  it("continues overview actions after scroll timeouts", async () => {
    const events = [];
    const controller = {
      async webFind() {
        return {};
      },
      async webFindAll() {
        return [];
      },
      async webOpen() {},
      async webScrollPageDown() {
        events.push("scroll");
        throw new TimeoutError("scroll timed out");
      },
      async webSleep() {},
    };

    const done = await navigatePaginatedAdOverview(
      controller,
      "https://www.kleinanzeigen.de/m-meine-anzeigen.html",
      async () => {
        events.push("action");
        return true;
      },
    );

    assert.equal(done, true);
    assert.deepEqual(events, ["scroll", "action"]);
  });
});
