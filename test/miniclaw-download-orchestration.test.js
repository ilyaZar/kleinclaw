import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractAdIdFromAdUrl,
  normalizeDownloadSelector,
  publishedAdsById,
  resolveDownloadAdActivity,
  runDownloadAdsBatch,
} from "../miniclaw/dist/download-orchestration.js";

let adCounter = 0;

function loadedAd(overrides = {}) {
  const id = overrides.id ?? 12345;
  const title = overrides.title ?? "a saved download title";
  const name = `download-${++adCounter}.yaml`;
  return {
    ad: {
      active: true,
      id,
      title,
    },
    filePath: `/tmp/miniclaw/${name}`,
    raw: { id, title },
    relativePath: `data/${name}`,
  };
}

describe("miniclaw download orchestration", () => {
  it("normalizes selectors and extracts ad ids like upstream", () => {
    assert.equal(normalizeDownloadSelector("all,new"), "all");
    assert.equal(normalizeDownloadSelector("new,new"), "new");
    assert.equal(normalizeDownloadSelector("123,456"), "123,456");
    assert.equal(
      extractAdIdFromAdUrl("https://www.kleinanzeigen.de/s-anzeige/title/123-1-2"),
      123,
    );
    assert.equal(
      extractAdIdFromAdUrl("https://www.kleinanzeigen.de/s-anzeige/title/123-1-2?x=1"),
      123,
    );
    assert.equal(extractAdIdFromAdUrl("https://example.test/not-an-id"), -1);
    assert.equal(extractAdIdFromAdUrl("https://example.test/123abc"), -1);
  });

  it("resolves active state from published profile metadata", () => {
    const adsById = publishedAdsById([
      { id: "123", state: "active" },
      { id: 456, state: "paused" },
      { id: "invalid", state: "active" },
    ]);

    assert.deepEqual(resolveDownloadAdActivity(123, adsById), {
      active: true,
      owned: true,
      publishedAd: { id: "123", state: "active" },
    });
    assert.deepEqual(resolveDownloadAdActivity(456, adsById), {
      active: false,
      owned: true,
      publishedAd: { id: 456, state: "paused" },
    });
    assert.deepEqual(resolveDownloadAdActivity(999, adsById), {
      active: false,
      owned: false,
      publishedAd: null,
    });
  });

  it("downloads all overview ads and skips invalid or unreachable entries", async () => {
    const calls = [];

    const result = await runDownloadAdsBatch({
      downloadAd: async (context) => {
        calls.push({
          active: context.active,
          id: context.adId,
          owned: context.owned,
          url: context.adUrl,
        });
      },
      downloadDir: "/tmp/downloaded-ads",
      extractOwnAdsUrls: async () => [
        "https://www.kleinanzeigen.de/s-anzeige/title/123-1-2",
        "https://www.kleinanzeigen.de/s-anzeige/title/456-1-2",
        "https://www.kleinanzeigen.de/s-anzeige/title/not-an-id",
      ],
      navigateToAdPage: async ({ adId }) => adId !== 456,
      publishedAds: [
        { id: 123, state: "active" },
        { id: 456, state: "paused" },
      ],
      selector: "all",
    });

    assert.equal(result.downloaded, 1);
    assert.equal(result.skipped, 2);
    assert.equal(result.targetCount, 2);
    assert.deepEqual(result.events.map((entry) => entry.status), [
      "downloaded",
      "skipped-navigation",
      "skipped-invalid-id",
    ]);
    assert.deepEqual(calls, [{
      active: true,
      id: 123,
      owned: true,
      url: "https://www.kleinanzeigen.de/s-anzeige/title/123-1-2",
    }]);
  });

  it("downloads only unsaved overview ads for the new selector", async () => {
    const calls = [];

    const result = await runDownloadAdsBatch({
      downloadAd: async (context) => {
        calls.push({
          active: context.active,
          id: context.adId,
        });
      },
      downloadDir: "/tmp/downloaded-ads",
      extractOwnAdsUrls: async () => [
        "https://www.kleinanzeigen.de/s-anzeige/title/123-1-2",
        "https://www.kleinanzeigen.de/s-anzeige/title/999-1-2",
      ],
      navigateToAdPage: async () => true,
      publishedAds: [{ id: 999, state: "active" }],
      savedAds: [loadedAd({ id: 123 })],
      selector: "new",
    });

    assert.equal(result.downloaded, 1);
    assert.equal(result.skipped, 1);
    assert.deepEqual(result.events.map((entry) => entry.status), [
      "skipped-saved",
      "downloaded",
    ]);
    assert.deepEqual(calls, [{ active: true, id: 999 }]);
  });

  it("downloads numeric ids directly and marks foreign ads inactive", async () => {
    const calls = [];
    const navigations = [];

    const result = await runDownloadAdsBatch({
      downloadAd: async (context) => {
        calls.push({
          active: context.active,
          id: context.adId,
          owned: context.owned,
          url: context.adUrl,
        });
      },
      downloadDir: "/tmp/downloaded-ads",
      extractOwnAdsUrls: async () => {
        throw new Error("numeric downloads should not scan the overview");
      },
      navigateToAdPage: async (context) => {
        navigations.push(context);
        return true;
      },
      publishedAds: [{ id: 123, state: "active" }],
      selector: "123,999",
    });

    assert.equal(result.downloaded, 2);
    assert.deepEqual(navigations.map((entry) => entry.adId), [123, 999]);
    assert.deepEqual(calls, [
      { active: true, id: 123, owned: true, url: null },
      { active: false, id: 999, owned: false, url: null },
    ]);
  });

  it("keeps Python behavior for owned non-active numeric downloads", async () => {
    const calls = [];
    const navigations = [];

    const result = await runDownloadAdsBatch({
      downloadAd: async (context) => {
        calls.push({
          active: context.active,
          id: context.adId,
          owned: context.owned,
          publishedState: context.publishedAd?.state,
        });
      },
      downloadDir: "/tmp/downloaded-ads",
      extractOwnAdsUrls: async () => {
        throw new Error("numeric downloads should not scan the overview");
      },
      navigateToAdPage: async (context) => {
        navigations.push(context);
        return true;
      },
      publishedAds: [{ id: 456, state: "delayed" }],
      selector: "456",
    });

    assert.equal(result.downloaded, 1);
    assert.equal(result.skipped, 0);
    assert.deepEqual(navigations, [{ adId: 456, adUrl: null, source: "numeric" }]);
    assert.deepEqual(calls, [{
      active: false,
      id: 456,
      owned: true,
      publishedState: "delayed",
    }]);
  });
});
