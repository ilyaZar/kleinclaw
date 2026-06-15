#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { VERSION, usage } from "./cli/help.js";
import {
  createDefaultConfig,
  runDiagnose,
  runUpdateCheck,
  updateContentHashes,
  verifyConfig,
} from "./cli/local-commands.js";
import { parseArgs, prepareCommand } from "./cli/parser.js";
import { runSideEffectCommand } from "./cli/side-effect-dispatch.js";
import { resolveCommandWorkspace } from "./cli/workspace-resolution.js";
import {
  type RunOptions,
} from "./cli/types.js";
import { errorMessage } from "./value-guards.js";

export { isValidAdsSelector, parseArgs, prepareCommand } from "./cli/parser.js";
export { planCommand } from "./cli/planning.js";
export type {
  CloseableSideEffectHandlers,
  Command,
  CommandPlan,
  CommandPreparation,
  CreateLiveSideEffects,
  ParsedArgs,
  PlannedAd,
  RunOptions,
  SideEffectCommandContext,
  SideEffectHandlers,
} from "./cli/types.js";

export async function run(
  argv = process.argv,
  options: RunOptions = {},
): Promise<number> {
  const parsed = parseArgs(argv);
  const commandPreparation = prepareCommand(parsed);
  if (!commandPreparation.ok) {
    console.error(commandPreparation.error);
    return 2;
  }
  parsed.adsSelector = commandPreparation.adsSelector;
  const workspace = await resolveCommandWorkspace(parsed);

  switch (parsed.command) {
    case "help":
      console.log(usage().trimEnd());
      return 0;
    case "version":
      console.log(VERSION);
      return 0;
    case "create-config":
      return createDefaultConfig(parsed.configPath);
    case "verify":
      return verifyConfig(parsed);
    case "update-check":
      if (!workspace) {
        throw new Error("Workspace must be resolved before update-check");
      }
      return runUpdateCheck(parsed, workspace);
    case "update-content-hash":
      return updateContentHashes(parsed);
    case "diagnose":
      return runDiagnose(parsed);
    case "publish":
    case "update":
    case "delete":
    case "download":
    case "extend":
      return runSideEffectCommand(
        parsed,
        options.sideEffects,
        options.createLiveSideEffects,
        workspace,
      );
    default:
      console.error(`Unknown command: ${parsed.command}`);
      return 2;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  try {
    process.exitCode = await run(process.argv);
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 2;
  }
}
