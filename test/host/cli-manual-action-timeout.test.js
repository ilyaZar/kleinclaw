import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildKleinanzeigenArgs } from "../../dist/cli-operation-arguments.js";
import {
  invokeMiniclaw,
  manualActionTimeoutSeconds,
  resolveCliConfig,
} from "../../dist/miniclaw-runtime.js";

function recordingRunner(calls) {
  return async (argv, options) => {
    calls.push({ argv, timeoutMs: options.timeoutMs });
    return { code: 0, stderr: "", stdout: "" };
  };
}

describe("manual action timeout", () => {
  it("defaults to 300 seconds and clamps to 0..1800", () => {
    assert.equal(manualActionTimeoutSeconds({}), 300);
    assert.equal(manualActionTimeoutSeconds({ manualActionTimeoutSeconds: 0 }), 0);
    assert.equal(manualActionTimeoutSeconds({ manualActionTimeoutSeconds: 9999 }), 1800);
  });

  it("passes the wait to live browser commands only", () => {
    const config = { configPath: "/tmp/config.yaml", manualActionTimeoutSeconds: 600 };
    assert.ok(buildKleinanzeigenArgs("publish", { selector: "new", confirm: true }, config)
      .includes("--manual-action-timeout=600"));
    assert.equal(
      buildKleinanzeigenArgs("verify", {}, config).some((arg) => arg.startsWith("--manual-action-timeout")),
      false,
    );
  });

  it("extends the runtime budget of live runs by the wait", async () => {
    const calls = [];
    const cliConfig = resolveCliConfig({
      commandRunner: recordingRunner(calls),
      configPath: "/tmp/config.yaml",
      manualActionTimeoutSeconds: 300,
      timeoutMs: 120000,
    });

    await invokeMiniclaw("verify", ["--config=/tmp/config.yaml", "verify"], cliConfig).catch(() => {});
    await invokeMiniclaw(
      "publish",
      ["--config=/tmp/config.yaml", "--allow-live-browser", "--manual-action-timeout=300", "publish"],
      cliConfig,
    ).catch(() => {});

    assert.deepEqual(calls.map((call) => call.timeoutMs), [120000, 420000]);
  });
});
