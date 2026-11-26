import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deletePublishedAd,
  deletionTargetIds,
} from "../../miniclaw/dist/publish-side-effects/publish-side-effects-delete-hook.js";

const publishedAds = [
  { id: 101, title: "Kinderfahrrad" },
  { id: "102", title: "Kinderfahrrad" },
  { id: 103, title: "Tisch" },
];

describe("miniclaw delete hook", () => {
  it("deletes exactly the ad's own ID even when titles match", () => {
    assert.deepEqual(
      deletionTargetIds({ id: 103, title: "Kinderfahrrad" }, publishedAds, true),
      [103],
    );
  });

  it("matches by title only for ads without an ID", () => {
    assert.deepEqual(
      deletionTargetIds({ id: null, title: "Tisch" }, publishedAds, true),
      [103],
    );
    assert.deepEqual(
      deletionTargetIds({ id: null, title: "Tisch" }, publishedAds, false),
      [],
    );
  });

  it("skips an ambiguous title match", () => {
    assert.deepEqual(
      deletionTargetIds({ id: null, title: "Kinderfahrrad" }, publishedAds, true),
      [],
    );
  });

  it("sends the CSRF token from the page script and clears the ID", async () => {
    const requests = [];
    const ad = { id: 103, title: "Tisch" };
    const deleted = await deletePublishedAd(
      {
        async webExecute(js) {
          assert.match(js, /data-initialprops/);
          return "astro-token";
        },
        async webOpen() {},
        async webRequest(url, method, codes, headers) {
          requests.push({ codes, headers, method, url });
          return { statusCode: 200 };
        },
        async webSleep() {},
      },
      "https://www.kleinanzeigen.de",
      { ad, deleteOldAdsByTitle: true, publishedAds },
    );

    assert.equal(deleted, true);
    assert.equal(ad.id, null);
    assert.deepEqual(requests, [{
      codes: [200, 404],
      headers: { "x-csrf-token": "astro-token" },
      method: "POST",
      url: "https://www.kleinanzeigen.de/m-anzeigen-loeschen.json?ids=103",
    }]);
  });

  it("stops before any request when no CSRF token is found", async () => {
    let requested = false;
    await assert.rejects(
      deletePublishedAd(
        {
          async webExecute() {
            return null;
          },
          async webOpen() {},
          async webRequest() {
            requested = true;
          },
          async webSleep() {},
        },
        "https://www.kleinanzeigen.de",
        { ad: { id: 103, title: "Tisch" }, deleteOldAdsByTitle: false, publishedAds },
      ),
      /Expected CSRF Token not found/,
    );
    assert.equal(requested, false);
  });
});
