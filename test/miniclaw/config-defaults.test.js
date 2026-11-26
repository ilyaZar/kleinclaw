import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Config } from "../../miniclaw/dist/model/config-model.js";

describe("miniclaw config defaults", () => {
  it("exposes request and image download timeout defaults", () => {
    const config = new Config();

    assert.equal(config.timeouts.imageDownload, 60);
    assert.equal(config.timeouts.webRequest, 60);

    const overridden = new Config({
      timeouts: {
        image_download: 61,
        web_request: 62,
      },
    });

    assert.equal(overridden.timeouts.imageDownload, 61);
    assert.equal(overridden.timeouts.webRequest, 62);
  });
});
