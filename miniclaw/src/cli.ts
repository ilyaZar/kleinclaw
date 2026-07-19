#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VERSION, usage } from "./cli/help.js";
import {
  createDefaultConfig,
  runDiagnose,
  updateContentHashes,
  verifyConfig,
} from "./cli/local-commands.js";
import { parseArgs, prepareCommand } from "./cli/parser.js";
import {
  setCommandResult,
  SUPPORTED_COMMANDS,
  writeCommandResult,
} from "./cli/messages.js";
import { runSideEffectCommand } from "./cli/side-effect-dispatch.js";
import { resolveCommandWorkspace } from "./cli/workspace-resolution.js";
import {
  type ParsedArgs,
  type RunOptions,
} from "./cli/types.js";
import { errorMessage, hasErrorName } from "./value-guards.js";

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

async function executeCommand(
  parsed: ParsedArgs,
  options: RunOptions,
): Promise<number> {
  const commandPreparation = prepareCommand(parsed);
  if (!commandPreparation.ok) {
    console.error(commandPreparation.error);
    setCommandResult(parsed, "failed", {
      diagnostics: [{
        code: "validation_error",
        severity: "error",
        message: commandPreparation.error ?? "Invalid command arguments",
      }],
    });
    return 2;
  }
  parsed.adsSelector = commandPreparation.adsSelector;
  const workspace = await resolveCommandWorkspace(parsed);

  switch (parsed.command) {
    case "help":
      if (parsed.output === "text") {
        console.log(usage().trimEnd());
      }
      return 0;
    case "version":
      if (parsed.output === "text") {
        console.log(VERSION);
      } else {
        setCommandResult(parsed, "succeeded", {
          commands: [...SUPPORTED_COMMANDS],
          version: VERSION,
        });
      }
      return 0;
    case "create-config":
      return createDefaultConfig(parsed.configPath);
    case "verify":
      return verifyConfig(parsed);
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

function errorDiagnostic(error: unknown) {
  const message = errorMessage(error);
  return {
    code: hasErrorName(error, "ManualActionRequiredError")
      ? "manual_action_required" as const
      : /validation error|invalid/i.test(message)
      ? "validation_error" as const
      : "internal_error" as const,
    severity: "error" as const,
    message,
  };
}

function jsonOutputRequested(argv: string[]): boolean {
  return argv.slice(2).some((arg, index, args) =>
    arg === "--output=json" ||
    (arg === "--output" && args[index + 1] === "json")
  );
}

function commandFromArgv(argv: string[]): string {
  const commands = new Set([
    ...SUPPORTED_COMMANDS,
    "create-config",
    "update-content-hash",
    "help",
    "version",
  ]);
  return argv.slice(2).find((arg) => commands.has(arg)) ?? "unknown";
}

export async function run(
  argv = process.argv,
  options: RunOptions = {},
): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (jsonOutputRequested(argv)) {
      console.log(JSON.stringify({
        schemaVersion: 1,
        command: commandFromArgv(argv),
        status: "failed",
        diagnostics: [errorDiagnostic(error)],
      }));
    }
    throw error;
  }
  try {
    const exitCode = await executeCommand(parsed, options);
    writeCommandResult(parsed, exitCode);
    return exitCode;
  } catch (error) {
    setCommandResult(parsed, "failed", {
      diagnostics: [errorDiagnostic(error)],
    });
    writeCommandResult(parsed, 2);
    throw error;
  }
}

const modulePath = fileURLToPath(import.meta.url);

async function isDirectInvocation(invokedPath: string | undefined): Promise<boolean> {
  if (!invokedPath) {
    return false;
  }

  const resolvedPath = path.resolve(invokedPath);
  try {
    return await fs.realpath(resolvedPath) === modulePath;
  } catch {
    return resolvedPath === modulePath;
  }
}

if (await isDirectInvocation(process.argv[1])) {
  try {
    process.exitCode = await run(process.argv);
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 2;
  }
}
