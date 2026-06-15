import path from "node:path";

import { isNumericIdSelector } from "../ad-selector.js";
import { type CommandPreparation, type ParsedArgs } from "./types.js";

export { NUMERIC_IDS_RE, isNumericIdSelector } from "../ad-selector.js";

function resolvePath(value: string): string {
  return path.resolve(value);
}

function readOptionValue(
  argv: string[],
  index: number,
  option: string,
): { value: string; nextIndex: number } {
  const current = argv[index] ?? "";
  const equals = current.indexOf("=");
  if (equals !== -1) {
    return { value: current.slice(equals + 1), nextIndex: index };
  }
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`${option} requires an argument`);
  }
  return { value, nextIndex: index + 1 };
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: "help",
    adsSelector: "due",
    adsSelectorExplicit: false,
    configPath: resolvePath("config.yaml"),
    configArg: null,
    logfilePath: resolvePath("miniclaw.log"),
    logfileExplicitlyProvided: false,
    logfileArg: null,
    workspaceMode: null,
    keepOldAds: false,
    allowLiveBrowser: false,
    verbose: false,
    lang: null,
  };
  const commands: string[] = [];

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "-h" || arg === "--help") {
      parsed.command = "help";
      return parsed;
    }
    if (arg === "-v" || arg === "--verbose") {
      parsed.verbose = true;
      continue;
    }
    if (arg === "--force") {
      parsed.adsSelector = "all";
      parsed.adsSelectorExplicit = true;
      continue;
    }
    if (arg === "--keep-old") {
      parsed.keepOldAds = true;
      continue;
    }
    if (arg === "--allow-live-browser") {
      parsed.allowLiveBrowser = true;
      continue;
    }
    if (arg.startsWith("--ads")) {
      const option = readOptionValue(argv, index, "--ads");
      parsed.adsSelector = option.value.trim().toLowerCase();
      parsed.adsSelectorExplicit = true;
      index = option.nextIndex;
      continue;
    }
    if (arg.startsWith("--config")) {
      const option = readOptionValue(argv, index, "--config");
      parsed.configArg = option.value;
      parsed.configPath = resolvePath(option.value);
      index = option.nextIndex;
      continue;
    }
    if (arg.startsWith("--logfile")) {
      const option = readOptionValue(argv, index, "--logfile");
      parsed.logfileArg = option.value;
      parsed.logfileExplicitlyProvided = true;
      parsed.logfilePath = option.value ? resolvePath(option.value) : null;
      index = option.nextIndex;
      continue;
    }
    if (arg.startsWith("--workspace-mode")) {
      const option = readOptionValue(argv, index, "--workspace-mode");
      const mode = option.value.trim().toLowerCase();
      if (mode !== "portable" && mode !== "xdg") {
        throw new Error(`Invalid --workspace-mode '${option.value}'`);
      }
      parsed.workspaceMode = mode;
      index = option.nextIndex;
      continue;
    }
    if (arg.startsWith("--lang")) {
      const option = readOptionValue(argv, index, "--lang");
      parsed.lang = option.value;
      index = option.nextIndex;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    }
    commands.push(arg);
  }

  if (commands.length > 1) {
    throw new Error(`More than one command given: ${commands.join(", ")}`);
  }
  parsed.command = commands[0] ?? "help";
  return parsed;
}

export function isValidAdsSelector(selector: string, validKeywords: Set<string>): boolean {
  return (
    validKeywords.has(selector) ||
    selector.split(",").every((entry) => validKeywords.has(entry.trim())) ||
    isNumericIdSelector(selector)
  );
}

function selectorError(selector: string, validValues: string): string {
  return `Invalid --ads selector: "${selector}". Valid values: ${validValues}.`;
}

export function prepareCommand(parsed: ParsedArgs): CommandPreparation {
  let adsSelector = parsed.adsSelector;
  let validKeywords: Set<string> | null = null;
  let defaultSelector: string | null = null;
  let validValues = "";

  switch (parsed.command) {
    case "verify":
    case "update-content-hash":
      adsSelector = "all";
      break;
    case "publish":
      validKeywords = new Set(["all", "new", "due", "changed"]);
      defaultSelector = "due";
      validValues = "comma-separated keywords (all, new, due, changed) or numeric IDs";
      break;
    case "update":
      validKeywords = new Set(["all", "changed"]);
      defaultSelector = "changed";
      validValues = "comma-separated keywords (all, changed) or numeric IDs";
      break;
    case "extend":
      validKeywords = new Set(["all"]);
      defaultSelector = "all";
      validValues = "all or comma-separated numeric IDs";
      break;
    case "download":
      validKeywords = new Set(["all", "new"]);
      defaultSelector = "new";
      validValues = "comma-separated keywords (all, new) or numeric IDs";
      break;
  }

  if (validKeywords !== null && !isValidAdsSelector(adsSelector, validKeywords)) {
    if (parsed.adsSelectorExplicit) {
      return {
        command: parsed.command,
        adsSelector,
        adsSelectorExplicit: parsed.adsSelectorExplicit,
        ok: false,
        error: selectorError(adsSelector, validValues),
      };
    }
    adsSelector = defaultSelector ?? adsSelector;
  }

  return {
    command: parsed.command,
    adsSelector,
    adsSelectorExplicit: parsed.adsSelectorExplicit,
    ok: true,
    error: null,
  };
}
