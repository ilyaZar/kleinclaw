import { type Workspace } from "../workspace.js";
import {
  hasInjectedDeleteHandlers,
  hasInjectedDownloadHandlers,
  hasInjectedExtendHandlers,
  hasInjectedPublishUpdateHandlers,
  runInjectedDeleteCommand,
  runInjectedDownloadCommand,
  runInjectedExtendCommand,
  runInjectedPublishUpdateCommand,
} from "./injected-runners.js";
import { runLiveBrowserCommand } from "./live-browser.js";
import { browserCommandMessage, printDoneBlock } from "./messages.js";
import { planCommand } from "./planning.js";
import {
  type CreateLiveSideEffects,
  type ParsedArgs,
  type SideEffectHandlers,
} from "./types.js";

export async function runSideEffectCommand(
  parsed: ParsedArgs,
  sideEffects?: SideEffectHandlers,
  createLiveSideEffects?: CreateLiveSideEffects,
  workspace?: Workspace | null,
): Promise<number> {
  if (hasInjectedPublishUpdateHandlers(parsed.command, sideEffects)) {
    return runInjectedPublishUpdateCommand(parsed, sideEffects!);
  }
  if (hasInjectedDeleteHandlers(parsed.command, sideEffects)) {
    return runInjectedDeleteCommand(parsed, sideEffects!);
  }
  if (hasInjectedExtendHandlers(parsed.command, sideEffects)) {
    return runInjectedExtendCommand(parsed, sideEffects!);
  }
  if (hasInjectedDownloadHandlers(parsed.command, sideEffects)) {
    if (!workspace) {
      throw new Error("Workspace must be resolved before download");
    }
    return runInjectedDownloadCommand(parsed, sideEffects!, workspace);
  }
  if (parsed.allowLiveBrowser) {
    return runLiveBrowserCommand(parsed, createLiveSideEffects, workspace);
  }

  const plan = await planCommand(parsed);
  if (plan.doneMessage) {
    printDoneBlock(plan.doneMessage);
    return 0;
  }
  if (plan.needsBrowser) {
    console.error(browserCommandMessage(plan));
    return 2;
  }
  return 0;
}
