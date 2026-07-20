import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createNodeCommandRunner,
} from "../../test-support/host/command-runner.js";

describe("CLI command runner", () => {
  it("captures process output and exit metadata without a shell", async () => {
    const runCommand = createNodeCommandRunner();
    const result = await runCommand([
      process.execPath,
      "-e",
      "process.stdout.write('ok'); process.stderr.write('warning')",
    ], { timeoutMs: 5000 });

    assert.equal(result.code, 0);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, "ok");
    assert.equal(result.stderr, "warning");
    assert.equal(result.termination, "exit");
    assert.equal(result.noOutputTimedOut, false);
  });
});
