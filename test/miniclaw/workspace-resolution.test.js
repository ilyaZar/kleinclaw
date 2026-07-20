import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { resolveWorkspace } from "../../miniclaw/dist/workspace.js";

function workspaceArgs(overrides = {}) {
  return {
    configArg: null,
    logfileArg: null,
    workspaceMode: null,
    logfileExplicitlyProvided: false,
    logBasename: "miniclaw",
    stdinIsTTY: false,
    ...overrides,
  };
}

describe("miniclaw workspace resolution", () => {
  it("requires an explicit mode when a config path has no workspace footprint", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-workspace-"));

    assert.throws(
      () => resolveWorkspace(workspaceArgs({
        cwd: tmp,
        env: {},
        configArg: "custom/config.yaml",
      })),
      /Cannot determine workspace mode[\s\S]*Detected neither portable nor XDG footprints/,
    );
  });

  it("reports both portable and XDG footprints when config mode is ambiguous", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-workspace-"));
    const home = path.join(tmp, "home");
    const xdgConfig = path.join(home, ".config", "miniclaw");
    await fs.mkdir(path.join(tmp, ".temp"), { recursive: true });
    await fs.writeFile(path.join(tmp, "config.yaml"), "ad_files: []\n", "utf8");
    await fs.mkdir(xdgConfig, { recursive: true });
    await fs.writeFile(path.join(xdgConfig, "config.yaml"), "ad_files: []\n", "utf8");

    assert.throws(
      () => resolveWorkspace(workspaceArgs({
        cwd: tmp,
        env: {},
        homeDir: home,
        configArg: "config.yaml",
      })),
      /Detected both portable and XDG footprints[\s\S]*Portable footprint hits[\s\S]*XDG footprint hits/,
    );
  });

  it("keeps XDG state/cache separate when a config override is provided", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-workspace-"));
    const home = path.join(tmp, "home");
    const workspace = resolveWorkspace(workspaceArgs({
      cwd: tmp,
      env: {},
      homeDir: home,
      configArg: "custom/config.yaml",
      workspaceMode: "xdg",
      logfileArg: "",
      logfileExplicitlyProvided: true,
    }));

    assert.equal(workspace.mode, "xdg");
    assert.equal(workspace.configFile, path.join(tmp, "custom", "config.yaml"));
    assert.equal(workspace.configDir, path.join(home, ".config", "miniclaw"));
    assert.equal(workspace.stateDir, path.join(home, ".local", "state", "miniclaw"));
    assert.equal(
      workspace.browserProfileDir,
      path.join(home, ".cache", "miniclaw", "browser-profile"),
    );
    assert.equal(workspace.logFile, null);
  });
});
