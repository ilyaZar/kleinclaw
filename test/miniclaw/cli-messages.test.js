import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Config } from "../../miniclaw/dist/model/config-model.js";
import {
  runInjectedPublishUpdateCommand,
} from "../../miniclaw/dist/cli/cli-injected-runners.js";
import {
  browserCommandMessage,
  deleteDoneMessage,
  downloadDoneMessage,
  extendDoneMessage,
  noAdsMessage,
  sideEffectDoneMessage,
} from "../../miniclaw/dist/cli/cli-messages.js";
import {
  captureStderr,
  parsedArgs,
} from "../../test-support/miniclaw/cli-gates-fixture.js";

describe("miniclaw injected command messages", () => {
  it("prints no-ad DONE blocks for injected publish/update commands", async () => {
    const { lines, result } = await captureStderr(() =>
      runInjectedPublishUpdateCommand(
        parsedArgs({ command: "update" }),
        {},
        {
          ads: [],
          config: new Config({ categories: {} }),
        },
      ),
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /DONE: No changed ads found/);
  });

  it("keeps user-visible DONE and browser-gate messages stable", () => {
    assert.equal(noAdsMessage("delete"), "DONE: No ads to delete found.");
    assert.equal(
      sideEffectDoneMessage("publish", 2, 1),
      "DONE: (Re-)published 2 ads (1 failed after retries)",
    );
    assert.equal(deleteDoneMessage(1, 3), "DONE: Deleted 1 of 3 ads");
    assert.equal(extendDoneMessage(0, 0), "DONE: No ads extended.");
    assert.equal(
      downloadDoneMessage("all", 1, 3),
      "DONE: Downloaded 1 of 3 ads",
    );
    assert.equal(browserCommandMessage({
      command: "download",
      adsSelector: "new",
      loadAds: false,
      excludeAdsWithId: null,
      selectedCount: null,
      selectedAds: [],
      needsBrowser: true,
      doneMessage: null,
    }), (
      "download requires browser automation; rerun with --allow-live-browser " +
      "after confirming the account side effect."
    ));
  });
});
