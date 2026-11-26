import {
  IP_RANGE_BLOCK_MESSAGE,
  IpRangeBlockedError,
} from "../auth.js";
import {
  CaptchaEncountered,
} from "../publish-form/publish-form-errors.js";
import { createBrowserPublishUpdateSideEffects } from "../publish-side-effects.js";
import { hasErrorName, isRecord } from "../value-guards.js";
import { type Workspace } from "../workspace.js";
import { isNumericIdSelector } from "../ad-selector.js";
import {
  hasInjectedDownloadHandlers,
  runInjectedDeleteCommand,
  runInjectedDownloadCommand,
  runInjectedExtendCommand,
  runInjectedPublishUpdateCommand,
} from "./cli-injected-runners.js";
import { loadDownloadCommand, loadSideEffectAds } from "./cli-loaders.js";
import { noAdsMessage, setCommandResult } from "./cli-messages.js";
import {
  type CloseableSideEffectHandlers,
  type Command,
  type CreateLiveSideEffects,
  type ParsedArgs,
} from "./cli-types.js";

const CAPTCHA_EXIT_CODE = 3;
const IP_RANGE_BLOCK_EXIT_CODE = 4;
const SIGNAL_CLEANUP_TIMEOUT_MS = 5000;

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

function isIpRangeBlocked(error: unknown): boolean {
  return error instanceof IpRangeBlockedError ||
    hasErrorName(error, "IpRangeBlockedError");
}

function isManualActionRequired(error: unknown): boolean {
  return hasErrorName(error, "ManualActionRequiredError");
}

function printIpRangeBlockBoundaryMessage(): void {
  console.error(IP_RANGE_BLOCK_MESSAGE);
  console.error("Live command stopped. Do not retry automatically.");
  console.error("Inform the user and try again later.");
}

function liveBoundaryExitCode(
  error: unknown,
  parsed: ParsedArgs,
): number | null {
  if (isIpRangeBlocked(error)) {
    printIpRangeBlockBoundaryMessage();
    setCommandResult(parsed, "failed", {
      diagnostics: [{
        code: "ip_range_blocked",
        severity: "error",
        message: IP_RANGE_BLOCK_MESSAGE,
      }],
    });
    return IP_RANGE_BLOCK_EXIT_CODE;
  }
  if (isCaptchaEncountered(error)) {
    printCaptchaBoundaryMessage(error);
    const restartDelaySeconds = captchaRestartDelaySeconds(error);
    setCommandResult(parsed, "failed", {
      diagnostics: [{
        code: "captcha",
        severity: "error",
        message: "Captcha encountered; live command stopped.",
        ...(restartDelaySeconds === null
          ? {}
          : { retryAfterSeconds: restartDelaySeconds }),
      }],
    });
    return CAPTCHA_EXIT_CODE;
  }
  if (isManualActionRequired(error)) {
    const message = error instanceof Error
      ? error.message
      : "Manual browser action requires an interactive run.";
    console.error(message);
    setCommandResult(parsed, "failed", {
      diagnostics: [{
        code: "manual_action_required",
        severity: "error",
        message,
      }],
    });
    return 2;
  }
  return null;
}

function hasUserActionResult(parsed: ParsedArgs): boolean {
  return parsed.result?.diagnostics?.some((entry) =>
    entry.code === "captcha" ||
    entry.code === "ip_range_blocked" ||
    entry.code === "manual_action_required"
  ) ?? false;
}

async function closeLiveSideEffects(
  sideEffects: CloseableSideEffectHandlers | null,
  parsed: ParsedArgs,
): Promise<void> {
  try {
    await sideEffects?.close?.();
  } catch (error) {
    if (!hasUserActionResult(parsed)) {
      throw error;
    }
    console.error(`Failed to close live browser: ${String(error)}`);
  }
}

function installLiveBrowserSignalCleanup(
  getSideEffects: () => CloseableSideEffectHandlers | null,
): () => void {
  const signals = ["SIGINT", "SIGTERM"] as const;
  const handlers = new Map<typeof signals[number], () => void>();

  const removeHandlers = () => {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler);
    }
    handlers.clear();
  };

  for (const signal of signals) {
    const handler = () => {
      removeHandlers();
      const exitCode = signal === "SIGINT" ? 130 : 143;
      const forceExit = setTimeout(() => process.exit(exitCode), SIGNAL_CLEANUP_TIMEOUT_MS);
      forceExit.unref?.();

      Promise.resolve(getSideEffects()?.close?.())
        .catch((error) => {
          console.error(`Failed to close live browser after ${signal}: ${String(error)}`);
        })
        .finally(() => {
          clearTimeout(forceExit);
          process.exit(exitCode);
        });
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }

  return removeHandlers;
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
    const removeSignalCleanup = installLiveBrowserSignalCleanup(() => sideEffects);
    try {
      sideEffects = await (
        createLiveSideEffects
          ? createLiveSideEffects({ config: loaded.config, parsed })
          : createBrowserPublishUpdateSideEffects(loaded.config, {
            allowLiveBrowser: true,
            command: parsed.command,
            loginOptions: { manualActionTimeout: parsed.manualActionTimeout },
            configPath: parsed.configPath,
            diagnosticsDir: workspace.diagnosticsDir,
            logFilePath: parsed.logfilePath,
            strictPublishedAds: isNumericIdSelector(loaded.effectiveSelector),
            workspaceBrowserProfileDir: workspace.browserProfileDir,
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
      const boundaryExitCode = liveBoundaryExitCode(error, parsed);
      if (boundaryExitCode !== null) {
        return boundaryExitCode;
      }
      throw error;
    } finally {
      removeSignalCleanup();
      await closeLiveSideEffects(sideEffects, parsed);
    }
  }

  const loaded = await loadSideEffectAds(parsed);
  if (!loaded.ads.length) {
    setCommandResult(parsed, "no_op", {
      counts: { changed: 0, failed: 0, total: 0 },
      message: noAdsMessage(parsed.command) ?? "DONE: No ads found.",
    });
    return 0;
  }

  let sideEffects: CloseableSideEffectHandlers | null = null;
  const removeSignalCleanup = installLiveBrowserSignalCleanup(() => sideEffects);

  try {
    sideEffects = await (
      createLiveSideEffects
        ? createLiveSideEffects({ config: loaded.config, parsed })
        : createBrowserPublishUpdateSideEffects(loaded.config, {
          allowLiveBrowser: true,
          command: parsed.command,
          loginOptions: { manualActionTimeout: parsed.manualActionTimeout },
          configPath: parsed.configPath,
          diagnosticsDir: workspace?.diagnosticsDir,
          logFilePath: parsed.logfilePath,
          workspaceBrowserProfileDir: workspace?.browserProfileDir,
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
    const boundaryExitCode = liveBoundaryExitCode(error, parsed);
    if (boundaryExitCode !== null) {
      return boundaryExitCode;
    }
    throw error;
  } finally {
    removeSignalCleanup();
    await closeLiveSideEffects(sideEffects, parsed);
  }
}
