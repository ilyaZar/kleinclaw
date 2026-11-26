// The start-page fixture is a sanitized sample from the kleinanzeigen-bot
// test suite (AGPL-3.0-or-later): the redesigned header is `hidden md:block`.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { JSDOM } from "jsdom";

import { getLoginState, LoginDetectionReason } from "../dist/auth.js";
import { LOGIN_DETECTION_SELECTORS } from "../dist/auth-login-state.js";
import { Config } from "../dist/model/config-model.js";
import { By } from "../dist/web-primitives.js";

async function startPage() {
  const html = await fs.readFile(
    new URL("fixtures/astro_start_page_logged_in_header.html", import.meta.url),
    "utf8",
  );
  return new JSDOM(html).window.document;
}

function find(document, [type, value]) {
  if (type === By.CLASS_NAME) return document.getElementsByClassName(value)[0] ?? null;
  if (type === By.ID) return document.getElementById(value);
  return null;
}

describe("miniclaw login detection on the redesigned start page", () => {
  it("finds the logged-in marker inside the header hidden below 768px", async () => {
    const document = await startPage();
    const marker = find(document, LOGIN_DETECTION_SELECTORS[0]);
    assert.ok(marker, "the first login selector matches the redesigned marker");
    assert.match(marker.closest("header").className, /\bhidden\b.*\bmd:block\b/);
    assert.match(marker.textContent, /angemeldet als: user@example\.com/);
  });

  it("detects the session when only textContent carries the e-mail", async () => {
    const document = await startPage();
    const controller = {
      page: { url: "https://www.kleinanzeigen.de/" },
      async webTextFirstAvailableOnce(selectors, options = {}) {
        for (const [index, selector] of selectors.entries()) {
          const element = find(document, selector);
          if (element) {
            // an unrendered header yields no selection-based visible text
            return [options.fallbackToTextContent ? element.textContent.trim() : "", index];
          }
        }
        throw Object.assign(new Error("no selector matched"), { name: "TimeoutError" });
      },
    };

    const state = await getLoginState(
      controller,
      new Config({ login: { username: "user@example.com" } }).login,
      { quickDomTimeout: 0.1 },
    );
    assert.equal(state.isLoggedIn, true);
    assert.equal(state.reason, LoginDetectionReason.USER_INFO_MATCH);
  });
});
