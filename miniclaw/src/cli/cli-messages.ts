import {
  type Command,
  type CommandDiagnostic,
  type CommandPlan,
  type CommandResult,
  type CommandStatus,
  type ParsedArgs,
} from "./cli-types.js";

export const SUPPORTED_COMMANDS = [
  "verify",
  "diagnose",
  "publish",
  "update",
  "delete",
  "download",
  "extend",
] as const;

export function commandStatus(
  changed: number,
  failed: number,
  total: number,
): CommandStatus {
  if (total === 0) {
    return "no_op";
  }
  if (failed === 0) {
    return changed === 0 ? "no_op" : "succeeded";
  }
  return changed === 0 ? "failed" : "partial_failure";
}

export function setCommandResult(
  parsed: ParsedArgs,
  status: CommandStatus,
  options: {
    counts?: CommandResult["counts"];
    diagnostics?: CommandDiagnostic[];
    message?: string;
    version?: string;
    commands?: string[];
  } = {},
): void {
  const { message, ...result } = options;
  parsed.result = {
    schemaVersion: 1,
    command: parsed.command,
    status,
    ...result,
  };
  if (parsed.output !== "json" && message) {
    printDoneBlock(message);
  }
}

export function setCountResult(
  parsed: ParsedArgs,
  changed: number,
  failed: number,
  total: number,
  message: string,
): void {
  setCommandResult(parsed, commandStatus(changed, failed, total), {
    counts: { changed, failed, total },
    message,
  });
}

export function writeCommandResult(parsed: ParsedArgs, exitCode: number): void {
  if (parsed.output !== "json") {
    return;
  }
  const result = parsed.result ?? {
    schemaVersion: 1 as const,
    command: parsed.command,
    status: exitCode === 0 ? "succeeded" as const : "failed" as const,
  };
  console.log(JSON.stringify(result));
}

export function noAdsMessage(command: Command | string): string | null {
  switch (command) {
    case "publish":
      return "DONE: No new/outdated ads found.";
    case "update":
      return "DONE: No changed ads found.";
    case "delete":
      return "DONE: No ads to delete found.";
    case "extend":
      return "DONE: No ads found to extend.";
    case "update-content-hash":
      return "DONE: No active ads found.";
    default:
      return null;
  }
}

export function printDoneBlock(message: string): void {
  console.error("############################################");
  console.error(message);
  console.error("############################################");
}

export function printDiagnosticLine(status: string, message: string): void {
  if (message.startsWith("===") || message.startsWith("  ")) {
    console.error(message);
    return;
  }
  console.error(`(${status}) ${message}`);
}

export function browserCommandMessage(plan: CommandPlan): string {
  if (plan.command === "download") {
    return (
      "download requires browser automation; rerun with " +
      "--allow-live-browser after confirming the account side effect."
    );
  }

  const count = plan.selectedCount ?? plan.selectedAds.length;
  const plural = count === 1 ? "ad" : "ads";
  return (
    `${plan.command} selected ${count} ${plural}, ` +
    "but browser automation is gated. Rerun with --allow-live-browser " +
    "after confirming the account side effect."
  );
}

function pluralizedAds(count: number): string {
  return `${count} ${count === 1 ? "ad" : "ads"}`;
}

export function sideEffectDoneMessage(
  command: Command | string,
  succeeded: number,
  failed: number,
): string {
  if (command === "publish") {
    const message = `DONE: (Re-)published ${pluralizedAds(succeeded)}`;
    return failed > 0
      ? `${message} (${failed} failed after retries)`
      : message;
  }
  if (command === "update") {
    const message = `DONE: Updated ${pluralizedAds(succeeded)}`;
    return failed > 0
      ? `${message} (${failed} failed after retries)`
      : message;
  }
  return `DONE: Processed ${pluralizedAds(succeeded)}`;
}

export function deleteDoneMessage(deleted: number, processed: number): string {
  return `DONE: Deleted ${deleted} of ${pluralizedAds(processed)}`;
}

export function extendDoneMessage(extended: number, attempted: number): string {
  if (attempted === 0) {
    return "DONE: No ads extended.";
  }
  return `DONE: Extended ${pluralizedAds(extended)}`;
}

export function downloadDoneMessage(
  selector: string,
  downloaded: number,
  targetCount: number,
): string {
  if (selector === "new") {
    return `DONE: Downloaded ${pluralizedAds(downloaded)}`;
  }
  return `DONE: Downloaded ${downloaded} of ${pluralizedAds(targetCount)}`;
}
