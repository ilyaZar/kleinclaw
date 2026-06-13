import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Config } from "../miniclaw/dist/model/config-model.js";
import {
  extractCategoryFromAdPage,
  extractSpecialAttributesFromAdPage,
} from "../miniclaw/dist/download-extractor/classification.js";
import {
  extractContactFromAdPage,
  extractSellDirectlyFromAdPage,
} from "../miniclaw/dist/download-extractor/contact.js";
import {
  downloadAndSaveImage,
  downloadImagesFromAdPage,
} from "../miniclaw/dist/download-extractor/images.js";
import {
  renderDownloadAdFileStem,
  renderDownloadFolderName,
  renderDownloadNameWithBudget,
  sanitizeFolderName,
} from "../miniclaw/dist/download-extractor/naming.js";
import {
  dimensionsFromBelenConf,
  parseGermanCreationDate,
  parseGermanDecimal,
  parsePriceAmount,
  shippingOptionsFromResponse,
  textAttribute,
  translateDamageAttribute,
} from "../miniclaw/dist/download-extractor/page-data.js";
import {
  extractPricingInfoFromAdPage,
  extractShippingInfoFromAdPage,
} from "../miniclaw/dist/download-extractor/pricing-shipping.js";
import {
  fileExists,
  FileExistsError,
  saveDownloadedAd,
} from "../miniclaw/dist/download-extractor/persistence.js";
import {
  By,
  TimeoutError,
} from "../miniclaw/dist/web-primitives.js";

function key(type, value) {
  return `${type}:${value}`;
}

function fakeElement({ attrs = {}, text = "" } = {}) {
  return {
    attrs,
    async getAttribute(name) {
      return attrs[name] ?? null;
    },
    async textContent() {
      return text;
    },
  };
}

function createController({
  elements = {},
  lists = {},
  texts = {},
  request,
} = {}) {
  return {
    async webFind(type, value) {
      const element = elements[key(type, value)];
      if (!element) {
        throw new TimeoutError(`missing ${type}:${value}`);
      }
      return element;
    },
    async webFindAll(type, value) {
      const list = lists[key(type, value)];
      if (!list) {
        throw new TimeoutError(`missing list ${type}:${value}`);
      }
      return list;
    },
    async webRequest(url, method, validCodes, headers) {
      return request?.(url, method, validCodes, headers);
    },
    async webText(type, value) {
      const result = texts[key(type, value)];
      if (result instanceof Error) {
        throw result;
      }
      if (result === undefined) {
        throw new TimeoutError(`missing text ${type}:${value}`);
      }
      return result;
    },
  };
}

describe("miniclaw download names", () => {
  it("sanitizes unsafe folder names and preserves ID placeholders under budget", () => {
    assert.equal(sanitizeFolderName(" con "), "untitled");
    assert.equal(sanitizeFolderName("../bad:name*  "), "badname");
    assert.equal(
      renderDownloadNameWithBudget("ad_{title}_{id}", 123456, "long speaker title", 12),
      "ad_lo_123456",
    );

    const config = new Config({
      download: {
        adFileNameTemplate: "{title}_{id}",
        folderNameMaxLength: 18,
        folderNameTemplate: "{id}_{title}",
      },
    });

    assert.equal(renderDownloadAdFileStem(config, 42, "Kenwood Boxen"), "Kenwood Boxen_42");
    assert.equal(renderDownloadFolderName(config, 42, "Kenwood Boxen"), "42_Kenwood Boxen");
  });
});

describe("miniclaw download page data parsing", () => {
  it("parses German formatted listing metadata", () => {
    const belenConf = {
      universalAnalyticsOpts: {
        dimensions: {
          ad_attributes: "condition_s:used|versand_s:skip",
        },
      },
    };

    assert.deepEqual(dimensionsFromBelenConf(belenConf), {
      ad_attributes: "condition_s:used|versand_s:skip",
    });
    assert.equal(textAttribute({ title: 123 }, "title"), "123");
    assert.equal(parseGermanDecimal("1.234,56"), 1234.56);
    assert.equal(parseGermanCreationDate("05.04.2026"), "2026-04-05T00:00:00");
    assert.equal(parsePriceAmount("1.234 \u20ac VB"), 1234);
    assert.equal(translateDamageAttribute("tf?"), "janein?");
  });

  it("filters malformed shipping options from gateway responses", () => {
    const options = shippingOptionsFromResponse({
      statusCode: 200,
      statusMessage: "ok",
      headers: {},
      content: JSON.stringify({
        data: {
          shippingOptionsResponse: {
            options: [
              { id: "DHL_002", packageSize: "M", priceInEuroCent: 549 },
              { id: "broken", packageSize: "M", priceInEuroCent: "549" },
              null,
            ],
          },
        },
      }),
    });

    assert.deepEqual(options, [{
      id: "DHL_002",
      packageSize: "M",
      priceInEuroCent: 549,
    }]);
  });
});

describe("miniclaw download pricing and shipping", () => {
  it("extracts user-visible price types from listing text", async () => {
    assert.deepEqual(
      await extractPricingInfoFromAdPage(createController({
        texts: { [key(By.ID, "viewad-price")]: "25 \u20ac" },
      })),
      [25, "FIXED"],
    );
    assert.deepEqual(
      await extractPricingInfoFromAdPage(createController({
        texts: { [key(By.ID, "viewad-price")]: "VB" },
      })),
      [null, "NEGOTIABLE"],
    );
    assert.deepEqual(
      await extractPricingInfoFromAdPage(createController({
        texts: { [key(By.ID, "viewad-price")]: "Zu verschenken" },
      })),
      [null, "GIVE_AWAY"],
    );
  });

  it("maps shipping cost text to configured shipping option names", async () => {
    const config = new Config({
      download: {
        includeAllMatchingShippingOptions: true,
        excludedShippingOptions: ["Hermes_M"],
      },
    });
    const controller = createController({
      texts: {
        [key(By.CLASS_NAME, "boxedarticle--details--shipping")]:
          "Versand 5,49 \u20ac",
      },
      request: async () => ({
        statusCode: 200,
        statusMessage: "ok",
        headers: {},
        content: JSON.stringify({
          data: {
            shippingOptionsResponse: {
              options: [
                { id: "DHL_002", packageSize: "M", priceInEuroCent: 549 },
                { id: "HERMES_003", packageSize: "M", priceInEuroCent: 549 },
              ],
            },
          },
        }),
      }),
    });

    assert.deepEqual(await extractShippingInfoFromAdPage(config, controller), [
      "SHIPPING",
      5.49,
      ["DHL_5"],
    ]);
  });
});

describe("miniclaw download contact and classification", () => {
  it("extracts contact fields while tolerating missing street and phone", async () => {
    const contactRoot = fakeElement();
    const nameRoot = fakeElement();
    const controller = createController({
      elements: {
        [key(By.ID, "viewad-contact")]: contactRoot,
        [key(By.CLASS_NAME, "iconlist-text")]: nameRoot,
      },
      texts: {
        [key(By.ID, "viewad-locality")]: "10115 Berlin Mitte",
        [key(By.ID, "street-address")]: new TimeoutError("no street"),
        [key(By.TAG_NAME, "a")]: new TimeoutError("no link name"),
        [key(By.TAG_NAME, "span")]: "Ilya",
        [key(By.ID, "viewad-contact-phone")]: new TimeoutError("no phone"),
      },
    });

    assert.deepEqual(await extractContactFromAdPage(controller), {
      location: "Berlin Mitte",
      name: "Ilya",
      phone: null,
      street: null,
      zipcode: "10115",
    });
  });

  it("uses published-ad metadata for sell-directly and category breadcrumbs", async () => {
    assert.equal(
      extractSellDirectlyFromAdPage(
        "https://www.kleinanzeigen.de/s-anzeige/title/123-1-2",
        new Map([[123, { buyNowEligible: true }]]),
      ),
      true,
    );

    const categoryLine = fakeElement();
    const controller = createController({
      elements: { [key(By.ID, "vap-brdcrmb")]: categoryLine },
      lists: {
        [key(By.CSS_SELECTOR, "a")]: [
          fakeElement({ attrs: { href: "/c100" } }),
          fakeElement({ attrs: { href: "/c100/c200" } }),
        ],
      },
    });

    assert.equal(await extractCategoryFromAdPage(controller), "100/200");
  });

  it("extracts special attributes from analytics dimensions before DOM fallback", async () => {
    assert.deepEqual(
      await extractSpecialAttributesFromAdPage(createController(), {
        universalAnalyticsOpts: {
          dimensions: {
            ad_attributes: "condition_s:new|foo.versand_s:skip|color:red:blue",
          },
        },
      }),
      {
        color: "red:blue",
        condition_s: "new",
      },
    );
  });
});

describe("miniclaw download images and persistence", () => {
  it("downloads gallery images and returns saved basenames only", async () => {
    const imageBox = fakeElement();
    const controller = createController({
      elements: { [key(By.CLASS_NAME, "galleryimage-large")]: imageBox },
      lists: {
        [key(By.CSS_SELECTOR, ".galleryimage-element[data-ix] > img")]: [
          fakeElement({ attrs: { src: "https://img.example/a.jpg" } }),
          fakeElement({ attrs: { src: "https://img.example/b.jpg" } }),
          fakeElement(),
        ],
      },
    });
    const calls = [];

    const images = await downloadImagesFromAdPage(
      controller,
      async (url, directory, prefix, imageNumber, options = {}) => {
        calls.push({
          directory,
          imageNumber,
          prefix,
          timeout: options.timeout,
          url,
        });
        return imageNumber === 1
          ? path.join(directory, `${prefix}${imageNumber}.jpg`)
          : null;
      },
      "/tmp/downloads",
      "ad_123",
      { imageDownloadTimeout: 60 },
    );

    assert.deepEqual(images, ["ad_123__img1.jpg"]);
    assert.deepEqual(calls, [
      {
        directory: "/tmp/downloads",
        imageNumber: 1,
        prefix: "ad_123__img",
        timeout: 60,
        url: "https://img.example/a.jpg",
      },
      {
        directory: "/tmp/downloads",
        imageNumber: 2,
        prefix: "ad_123__img",
        timeout: 60,
        url: "https://img.example/b.jpg",
      },
    ]);
  });

  it("times out stalled image downloads", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-image-"));
    const originalFetch = globalThis.fetch;
    let aborted = false;
    globalThis.fetch = async (_url, options = {}) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          aborted = true;
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    try {
      const startedAt = Date.now();
      const result = await downloadAndSaveImage(
        "https://img.example/slow.jpg",
        tmp,
        "ad__img",
        1,
        { timeout: 0.01 },
      );

      assert.equal(result, null);
      assert.equal(aborted, true);
      assert.ok(Date.now() - startedAt < 1000);
    } finally {
      globalThis.fetch = originalFetch;
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });

  it("does not overwrite an existing backup during downloaded ad save", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-download-"));
    const finalDir = path.join(tmp, "ad_123");
    const stagingDir = path.join(tmp, ".tmp-ad_123");
    const backupDir = path.join(tmp, ".bak-ad_123");

    try {
      await fs.mkdir(finalDir);
      await fs.writeFile(path.join(finalDir, "old.txt"), "old", "utf8");
      await fs.mkdir(stagingDir);
      await fs.mkdir(backupDir);

      await assert.rejects(
        () => saveDownloadedAd({
          adConfig: {
            active: true,
            title: "downloaded listing",
            description: "download persistence should avoid overwrite",
            category: "100/200",
          },
          adFileStem: "ad_123",
          adId: 123,
          finalDir,
          stagingDir,
        }),
        (error) => {
          assert.equal(error instanceof FileExistsError, true);
          assert.match(error.message, /already exists/);
          return true;
        },
      );

      assert.equal(await fileExists(path.join(finalDir, "old.txt")), true);
      assert.equal(await fileExists(stagingDir), false);
      assert.equal(await fileExists(backupDir), true);
    } finally {
      await fs.rm(tmp, { force: true, recursive: true });
    }
  });
});
