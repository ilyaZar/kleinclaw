import { CaptchaEncountered } from "../publish-form.js";
import { createBrowserPublishUpdateSideEffects } from "../publish-side-effects.js";
import { hasErrorName, isRecord } from "../value-guards.js";
import { type Workspace } from "../workspace.js";
import {
  hasInjectedDownloadHandlers,
  runInjectedDeleteCommand,
  runInjectedDownloadCommand,
  runInjectedExtendCommand,
  runInjectedPublishUpdateCommand,
} from "./injected-runners.js";
import { loadDownloadCommand, loadSideEffectAds } from "./loaders.js";
import { noAdsMessage, printDoneBlock } from "./messages.js";
import { NUMERIC_IDS_RE } from "./parser.js";
import {
  type CloseableSideEffectHandlers,
  type Command,
  type CreateLiveSideEffects,
  type ParsedArgs,
} from "./types.js";

const CAPTCHA_EXIT_CODE = 3;

function canRunLiveBrowserCommand(command: Command | string): boolean {
  return command === "publish" ||
    command === "update" ||
    command === "delete" ||
    command === "extend" ||
    command === "download";
}

function isCaptchaEncountered(error: unknown): boolean {
  return error instanceof CaptchaEncountered ||
    hasErrorName(error, "CaptchaEncountered");
}

function captchaRestartDelaySeconds(error: unknown): number | null {
  if (error instanceof CaptchaEncountered) {
    return error.restartDelaySeconds;
  }
  if (!isRecord(error)) {
    return null;
  }
  const value = error.restartDelaySeconds;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function printCaptchaBoundaryMessage(error: unknown): void {
  console.error("Captcha encountered; live command stopped.");
  const restartDelaySeconds = captchaRestartDelaySeconds(error);
  if (restartDelaySeconds !== null) {
    console.error(`Configured restart delay: ${restartDelaySeconds} seconds.`);
  }
  console.error("Retry from the caller after the delay or rerun after solving it.");
}

export async function runLiveBrowserCommand(
  parsed: ParsedArgs,
  createLiveSideEffects?: CreateLiveSideEffects,
  workspace?: Workspace | null,
): Promise<number> {
  if (!canRunLiveBrowserCommand(parsed.command)) {
    console.error(
      "--allow-live-browser is currently supported only for publish, " +
        "update, delete, extend, and injected download runs.",
    );
    return 2;
  }

  if (parsed.command === "download") {
    if (!workspace) {
      throw new Error("Workspace must be resolved before download");
    }
    const loaded = await loadDownloadCommand(parsed, workspace);
    let sideEffects: CloseableSideEffectHandlers | null = null;
    try {
      sideEffects = await (
        createLiveSideEffects
          ? createLiveSideEffects({ config: loaded.config, parsed })
          : createBrowserPublishUpdateSideEffects(loaded.config, {
            allowLiveBrowser: true,
            command: parsed.command,
            configPath: parsed.configPath,
            diagnosticsDir: workspace.diagnosticsDir,
            logFilePath: parsed.logfilePath,
            strictPublishedAds: NUMERIC_IDS_RE.test(loaded.effectiveSelector),
          })
      );
      if (!hasInjectedDownloadHandlers(parsed.command, sideEffects)) {
        console.error(
          "download requires injected fetch, overview, navigation, and " +
            "download hooks.",
        );
        return 2;
      }
      return await runInjectedDownloadCommand(parsed, sideEffects, workspace);
    } catch (error) {
      if (isCaptchaEncountered(error)) {
        printCaptchaBoundaryMessage(error);
        return CAPTCHA_EXIT_CODE;
      }
      throw error;
    } finally {
      await sideEffects?.close?.();
    }
  }

  const loaded = await loadSideEffectAds(parsed);
  if (!loaded.ads.length) {
    printDoneBlock(noAdsMessage(parsed.command) ?? "DONE: No ads found.");
    return 0;
  }

  let sideEffects: CloseableSideEffectHandlers | null = null;

  try {
    sideEffects = await (
      createLiveSideEffects
        ? createLiveSideEffects({ config: loaded.config, parsed })
        : createBrowserPublishUpdateSideEffects(loaded.config, {
          allowLiveBrowser: true,
          command: parsed.command,
          configPath: parsed.configPath,
          diagnosticsDir: workspace?.diagnosticsDir,
          logFilePath: parsed.logfilePath,
        })
    );
    if (parsed.command === "delete") {
      return await runInjectedDeleteCommand(parsed, sideEffects, loaded);
    }
    if (parsed.command === "extend") {
      return await runInjectedExtendCommand(parsed, sideEffects, loaded);
    }
    return await runInjectedPublishUpdateCommand(parsed, sideEffects, loaded);
  } catch (error) {
    if (isCaptchaEncountered(error)) {
      printCaptchaBoundaryMessage(error);
      return CAPTCHA_EXIT_CODE;
    }
    throw error;
  } finally {
    await sideEffects?.close?.();
  }
}
