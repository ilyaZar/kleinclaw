import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function parsedArgs(overrides = {}) {
  return {
    command: "publish",
    adsSelector: "all",
    adsSelectorExplicit: true,
    adFileOverrides: [],
    configPath: path.resolve("config.yaml"),
    configArg: null,
    logfilePath: path.resolve("miniclaw.log"),
    logfileExplicitlyProvided: false,
    logfileArg: null,
    workspaceMode: null,
    keepOldAds: false,
    allowLiveBrowser: false,
    ...overrides,
  };
}

export async function captureStderr(fn) {
  const original = console.error;
  const originalLog = console.log;
  const lines = [];
  const stdout = [];
  console.error = (...args) => {
    lines.push(args.join(" "));
  };
  console.log = (...args) => {
    stdout.push(args.join(" "));
  };
  try {
    const result = await fn();
    return { lines, result, stdout };
  } finally {
    console.error = original;
    console.log = originalLog;
  }
}

export async function createListingWorkspace(
  { active = true, id = null } = {},
) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "miniclaw-cli-gates-"));
  const adDir = path.join(tmp, "ads", "listing");
  const configPath = path.join(tmp, "config.yaml");
  await fs.mkdir(adDir, { recursive: true });
  await fs.writeFile(
    configPath,
    [
      "ad_files:",
      "  - ads/**/ad.yaml",
      "categories: {}",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(adDir, "ad.yaml"),
    [
      `active: ${active ? "true" : "false"}`,
      ...(id === null ? [] : [`id: ${id}`]),
      "title: cli gate listing",
      "description: this listing exercises command planning",
      "category: Audio_und_Hifi",
      "price_type: NEGOTIABLE",
      "",
    ].join("\n"),
    "utf8",
  );
  return { configPath, tmp };
}
