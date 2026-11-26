import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

import {
  ManualActionRequiredError,
  SMS_VERIFICATION_XPATH,
  waitForManualAction,
} from "../dist/auth-manual-verification.js";
import { parseArgs } from "../dist/cli/cli-parser.js";

function sleeper() {
  const sleeps = [];
  return { controller: { async webSleep(ms) { sleeps.push(ms); } }, sleeps };
}

describe("miniclaw manual action wait", () => {
  it("polls the page until the user finished the step in the browser", async () => {
    const { controller, sleeps } = sleeper();
    let checks = 0;
    await waitForManualAction(controller, "# Captcha present!", async () => {
      checks += 1;
      return checks === 3;
    }, { interactive: false, timeoutSeconds: 300 });
    assert.equal(checks, 3);
    assert.deepEqual(sleeps, [2000, 2000]);
  });

  it("gives up with a manual-action error after the timeout", async () => {
    const { controller } = sleeper();
    await assert.rejects(
      waitForManualAction(controller, "# Captcha present!", async () => false, {
        interactive: false,
        timeoutSeconds: 0.001,
      }),
      (error) => error instanceof ManualActionRequiredError &&
        /not done within 0.001 s/.test(error.message),
    );
  });

  it("does not wait at all when the timeout is 0", async () => {
    const { controller, sleeps } = sleeper();
    await assert.rejects(
      waitForManualAction(controller, "# Captcha present!", async () => true, {
        interactive: false,
        timeoutSeconds: 0,
      }),
      /requires an interactive run/,
    );
    assert.deepEqual(sleeps, []);
  });

  it("recognizes both SMS verification stages but not page data", () => {
    const matches = (body) => {
      const dom = new JSDOM(`<!DOCTYPE html><body>${body}</body>`);
      const { document, XPathResult } = dom.window;
      return document.evaluate(SMS_VERIFICATION_XPATH, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        .singleNodeValue !== null;
    };
    assert.equal(matches("<p>Wir senden dir einen <b>Code</b> per SMS.</p><button>Code senden</button>"), true);
    assert.equal(matches("<p>Wir haben dir gerade einen 6-stelligen Code für die Telefonnummer geschickt.</p>"), true);
    assert.equal(matches("<script>const t = 'Wir senden dir einen Code';</script>"), false);
    assert.equal(matches("<p>Willkommen zurück</p>"), false);
  });

  it("parses the manual action timeout option", () => {
    assert.equal(parseArgs(["node", "miniclaw", "publish"]).manualActionTimeout, 300);
    assert.equal(
      parseArgs(["node", "miniclaw", "--manual-action-timeout=600", "publish"]).manualActionTimeout,
      600,
    );
    assert.throws(
      () => parseArgs(["node", "miniclaw", "--manual-action-timeout=9999", "publish"]),
      /Invalid --manual-action-timeout/,
    );
  });
});
