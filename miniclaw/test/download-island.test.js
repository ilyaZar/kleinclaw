// Astro fixtures and the anonymous dimensions sample are sanitized samples
// from the kleinanzeigen-bot test suite (AGPL-3.0-or-later).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  islandContactName,
  islandCreationDate,
  islandImageUrls,
  islandPricing,
  islandShippingText,
  islandSpecialAttributes,
  parseIslandProps,
} from "../dist/download-extractor/download-extractor-island.js";
import {
  fetchAnonymousAdDimensions,
  parseAdDimensionsHtml,
} from "../dist/download-extractor/download-extractor-page-data.js";
import { parseAdAttributes } from "../dist/download-extractor/download-extractor-classification.js";
import {
  extractPricingInfoFromAdPage,
  extractShippingInfoFromAdPage,
} from "../dist/download-extractor/download-extractor-pricing-shipping.js";
import { extractContactFromAdPage } from "../dist/download-extractor/download-extractor-contact.js";
import { runDownloadAdsBatch } from "../dist/download-orchestration.js";
import { Config } from "../dist/model/config-model.js";
import { TimeoutError } from "../dist/web-primitives.js";

async function fixture(name) {
  return JSON.parse(await fs.readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8"));
}

describe("miniclaw Astro island data", () => {
  it("unwraps the props envelope and reads the ad fields", async () => {
    const shipping = await fixture("astro_ad_props_shipping.json");
    const props = parseIslandProps(JSON.stringify({ data: [0, shipping] }));

    assert.deepEqual(islandPricing(props), [120, "NEGOTIABLE"]);
    assert.equal(islandShippingText(props), "+ Versand ab 0,99 €");
    assert.equal(islandCreationDate(props), "25.08.2026");

    const pickup = parseIslandProps(JSON.stringify(await fixture("astro_ad_props_pickup.json")));
    assert.equal(islandShippingText(pickup), "Nur Abholung");
  });

  it("reads images, the full contact name, and labelled attributes", () => {
    const props = parseIslandProps(JSON.stringify({
      imageDetails: [0, { imageList: [1, [
        [0, { largeUrl: [0, "https://img/1-l.jpg"], xxLargeUrl: [0, "https://img/1-xxl.jpg"] }],
        [0, { largeUrl: [0, "https://img/2-l.jpg"] }],
      ]] }],
      localizedAttributes: [1, [
        [0, { localizedName: [0, "Zustand"], localizedValue: [0, "Sehr gut"] }],
        [0, { localizedName: [0, "Art"], localizedValue: [0, "Zubehör"] }],
        [0, { localizedName: [0, "Farbe"], localizedValue: [0, "Blau"] }],
      ]],
      price: [0, { amount: [0, null], type: [0, "GIVE_AWAY"] }],
      userDetails: [0, { contactName: [0, "Max Mustermann"] }],
    }));

    assert.deepEqual(islandImageUrls(props), ["https://img/1-xxl.jpg", "https://img/2-l.jpg"]);
    assert.equal(islandContactName(props), "Max Mustermann");
    assert.deepEqual(islandSpecialAttributes(props), { art_s: "Zubehör", condition_s: "like_new" });
    assert.deepEqual(islandPricing(props), [null, "GIVE_AWAY"]);
  });

  it("returns empty data for pages without an island", () => {
    assert.deepEqual(parseIslandProps(null), {});
    assert.deepEqual(parseIslandProps("{not json"), {});
    assert.equal(islandPricing({}), null);
  });
});

describe("miniclaw anonymous ad dimensions", () => {
  it("parses the dimensions from the classic page HTML", async () => {
    const sample = await fixture("anonymous_ad_dimensions_sample.json");
    const html = `<script>window.BelenConf = { universalAnalyticsOpts: { dimensions: ${JSON.stringify(sample)} } };</script>`;
    const dimensions = parseAdDimensionsHtml(html);
    assert.equal(dimensions.ad_type, "OFFERED");
    assert.deepEqual(parseAdAttributes(dimensions.ad_attributes), { art_s: "gesellschaftsspiele" });

    const truncated = '{"click": "{x}", "ad_attributes": "art_s:a&amp;b|seller_badges_s:y"}';
    assert.deepEqual(parseAdDimensionsHtml(truncated), { ad_attributes: "art_s:a&b|seller_badges_s:y" });
  });

  it("follows redirects only within Kleinanzeigen hosts", async () => {
    const page = '<script>{"ad_attributes":"art_s:x","ad_type":"OFFERED"}</script>';
    const responses = {
      "https://www.kleinanzeigen.de/s-anzeige/42": { location: "/s-anzeige/titel/42-1-2", status: 301 },
      "https://www.kleinanzeigen.de/s-anzeige/titel/42-1-2": { body: page, status: 200 },
      "https://www.kleinanzeigen.de/s-anzeige/7": { location: "http://169.254.169.254/", status: 302 },
    };
    const fetchImpl = async (url, init) => {
      assert.equal(init.redirect, "manual");
      const entry = responses[String(url)];
      return {
        headers: { get: () => entry.location ?? null },
        ok: entry.status === 200,
        status: entry.status,
        text: async () => entry.body,
      };
    };

    assert.deepEqual(await fetchAnonymousAdDimensions(42, { fetchImpl }), {
      ad_attributes: "art_s:x",
      ad_type: "OFFERED",
    });
    assert.equal(await fetchAnonymousAdDimensions(7, { fetchImpl }), null);
  });
});

function readController({ present = {}, texts = {} } = {}) {
  return {
    async webFind(type, value) {
      if (present[value]) return {};
      throw new TimeoutError(`missing ${value}`);
    },
    async webProbe(type, value) {
      return present[value] ? {} : null;
    },
    async webRequest() {
      return { content: "[]", statusCode: 200 };
    },
    async webText(type, value) {
      if (value in texts) return texts[value];
      throw new TimeoutError(`missing ${value}`);
    },
  };
}

describe("miniclaw island fallbacks on redesigned pages", () => {
  it("uses island price and shipping when the classic markup is absent", async () => {
    const controller = readController();
    assert.deepEqual(await extractPricingInfoFromAdPage(controller, [120, "NEGOTIABLE"]), [120, "NEGOTIABLE"]);
    assert.deepEqual(
      await extractShippingInfoFromAdPage(new Config({}), controller, "Nur Abholung"),
      ["PICKUP", null, null],
    );
    assert.deepEqual(
      await extractPricingInfoFromAdPage(readController({ present: { "viewad-price": true }, texts: { "viewad-price": "50 €" } }), [120, "NEGOTIABLE"]),
      [50, "FIXED"],
    );
  });

  it("prefers the island name over initials in the redesigned contact box", async () => {
    const controller = readController({
      texts: { "viewad-locality": "12345 Berlin - Mitte" },
    });
    const contact = await extractContactFromAdPage(controller, "Max Mustermann");
    assert.equal(contact.name, "Max Mustermann");
    assert.equal(contact.zipcode, "12345");
  });
});

describe("miniclaw download batch", () => {
  it("records a failed ad and continues with the rest", async () => {
    const downloaded = [];
    const result = await runDownloadAdsBatch({
      downloadAd: async ({ adId }) => {
        if (adId === 2) throw new Error("unreadable page");
        downloaded.push(adId);
      },
      downloadDir: "/tmp/ads",
      navigateToAdPage: async () => true,
      selector: "1,2,3",
    });
    assert.deepEqual(downloaded, [1, 3]);
    assert.equal(result.downloaded, 2);
    assert.deepEqual(result.events.map((entry) => entry.status), ["downloaded", "failed", "downloaded"]);
  });

  it("still stops at a session boundary", async () => {
    const boundary = new Error("captcha");
    boundary.name = "CaptchaEncountered";
    await assert.rejects(runDownloadAdsBatch({
      downloadAd: async () => {
        throw boundary;
      },
      downloadDir: "/tmp/ads",
      navigateToAdPage: async () => true,
      selector: "1,2",
    }), boundary);
  });
});

