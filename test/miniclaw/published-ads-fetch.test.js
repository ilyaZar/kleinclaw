import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchPublishedAds,
  PublishedAdsFetchIncompleteError,
} from "../../miniclaw/dist/published-ads.js";

describe("miniclaw published ads fetch", () => {
  it("fetches paginated ad JSON with Python-shaped response content", async () => {
    const requestedUrls = [];
    const pages = new Map([
      [1, {
        ads: [{ id: 101, state: "ACTIVE", title: "first" }],
        paging: { pageNum: "1", last: "2", next: "2" },
      }],
      [2, {
        ads: [{ id: 202, state: "INACTIVE", title: "second" }],
        paging: { pageNum: 2, last: 2 },
      }],
    ]);

    const ads = await fetchPublishedAds(async (url) => {
      requestedUrls.push(url);
      const page = Number(new URL(url).searchParams.get("pageNum"));
      const content = JSON.stringify(pages.get(page));
      return { content: Buffer.from(content, "utf8") };
    }, { rootUrl: "https://example.invalid" });

    assert.deepEqual(requestedUrls, [
      "https://example.invalid/m-meine-anzeigen-verwalten.json?sort=DEFAULT&pageNum=1",
      "https://example.invalid/m-meine-anzeigen-verwalten.json?sort=DEFAULT&pageNum=2",
    ]);
    assert.deepEqual(ads.map((ad) => ad.id), [101, 202]);
  });

  it("fails closed in strict mode when pagination payloads are malformed", async () => {
    await assert.rejects(
      () => fetchPublishedAds(async () => ({
        content: JSON.stringify({
          ads: [{ id: 101, state: "ACTIVE" }, "not-an-ad"],
          paging: { pageNum: 1, last: 1 },
        }),
      }), { strict: true }),
      (error) => {
        assert.equal(error instanceof PublishedAdsFetchIncompleteError, true);
        assert.match(error.message, /Filtered 1 malformed ad entries/);
        return true;
      },
    );
  });

  it("uses max-page limits as a strict infinite-loop guard", async () => {
    let page = 0;
    await assert.rejects(
      () => fetchPublishedAds(async () => {
        page += 1;
        return {
          content: JSON.stringify({
            ads: [{ id: page, state: "ACTIVE" }],
            paging: { pageNum: page, next: page + 1 },
          }),
        };
      }, { strict: true, maxPageLimit: 2 }),
      /Stopping pagination after 2 pages/,
    );
  });
});
