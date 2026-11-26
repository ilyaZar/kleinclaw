import { describe, it } from "node:test";

import {
  runCdpBrowserPageCases,
} from "../test-support/cdp-browser-page-cases.js";
import {
  runCdpLocatorCases,
} from "../test-support/cdp-locator-cases.js";

describe("miniclaw CDP adapter", () => {
  it("keeps the browser session planner on miniclaw CDP profile semantics", async () => {
    const context = await runCdpBrowserPageCases();
    await runCdpLocatorCases(context);
  });
});
