import { CaptchaEncountered } from "../publish-form.js";
import { createBrowserPublishUpdateSideEffects } from "../publish-side-effects.js";
import { hasErrorName, isRecord } from "../value-guards.js";
import { isNumericIdSelector } from "../ad-selector.js";
import { hasInjectedDownloadHandlers, runInjectedDeleteCommand, runInjectedDownloadCommand, runInjectedExtendCommand, runInjectedPublishUpdateCommand, } from "./injected-runners.js";
import { loadDownloadCommand, loadSideEffectAds } from "./loaders.js";
import { noAdsMessage, printDoneBlock } from "./messages.js";
const CAPTCHA_EXIT_CODE = 3;
const SIGNAL_CLEANUP_TIMEOUT_MS = 5000;
function canRunLiveBrowserCommand(command) {
    return command === "publish" ||
        command === "update" ||
        command === "delete" ||
        command === "extend" ||
        command === "download";
}
function isCaptchaEncountered(error) {
    return error instanceof CaptchaEncountered ||
        hasErrorName(error, "CaptchaEncountered");
}
function captchaRestartDelaySeconds(error) {
    if (error instanceof CaptchaEncountered) {
        return error.restartDelaySeconds;
    }
    if (!isRecord(error)) {
        return null;
    }
    const value = error.restartDelaySeconds;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function printCaptchaBoundaryMessage(error) {
    console.error("Captcha encountered; live command stopped.");
    const restartDelaySeconds = captchaRestartDelaySeconds(error);
    if (restartDelaySeconds !== null) {
        console.error(`Configured restart delay: ${restartDelaySeconds} seconds.`);
    }
    console.error("Retry from the caller after the delay or rerun after solving it.");
}
function installLiveBrowserSignalCleanup(getSideEffects) {
    const signals = ["SIGINT", "SIGTERM"];
    const handlers = new Map();
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
export async function runLiveBrowserCommand(parsed, createLiveSideEffects, workspace) {
    if (!canRunLiveBrowserCommand(parsed.command)) {
        console.error("--allow-live-browser is currently supported only for publish, " +
            "update, delete, extend, and injected download runs.");
        return 2;
    }
    if (parsed.command === "download") {
        if (!workspace) {
            throw new Error("Workspace must be resolved before download");
        }
        const loaded = await loadDownloadCommand(parsed, workspace);
        let sideEffects = null;
        const removeSignalCleanup = installLiveBrowserSignalCleanup(() => sideEffects);
        try {
            sideEffects = await (createLiveSideEffects
                ? createLiveSideEffects({ config: loaded.config, parsed })
                : createBrowserPublishUpdateSideEffects(loaded.config, {
                    allowLiveBrowser: true,
                    command: parsed.command,
                    configPath: parsed.configPath,
                    diagnosticsDir: workspace.diagnosticsDir,
                    logFilePath: parsed.logfilePath,
                    strictPublishedAds: isNumericIdSelector(loaded.effectiveSelector),
                    workspaceBrowserProfileDir: workspace.browserProfileDir,
                }));
            if (!hasInjectedDownloadHandlers(parsed.command, sideEffects)) {
                console.error("download requires injected fetch, overview, navigation, and " +
                    "download hooks.");
                return 2;
            }
            return await runInjectedDownloadCommand(parsed, sideEffects, workspace);
        }
        catch (error) {
            if (isCaptchaEncountered(error)) {
                printCaptchaBoundaryMessage(error);
                return CAPTCHA_EXIT_CODE;
            }
            throw error;
        }
        finally {
            removeSignalCleanup();
            await sideEffects?.close?.();
        }
    }
    const loaded = await loadSideEffectAds(parsed);
    if (!loaded.ads.length) {
        printDoneBlock(noAdsMessage(parsed.command) ?? "DONE: No ads found.");
        return 0;
    }
    let sideEffects = null;
    const removeSignalCleanup = installLiveBrowserSignalCleanup(() => sideEffects);
    try {
        sideEffects = await (createLiveSideEffects
            ? createLiveSideEffects({ config: loaded.config, parsed })
            : createBrowserPublishUpdateSideEffects(loaded.config, {
                allowLiveBrowser: true,
                command: parsed.command,
                configPath: parsed.configPath,
                diagnosticsDir: workspace?.diagnosticsDir,
                logFilePath: parsed.logfilePath,
                workspaceBrowserProfileDir: workspace?.browserProfileDir,
            }));
        if (parsed.command === "delete") {
            return await runInjectedDeleteCommand(parsed, sideEffects, loaded);
        }
        if (parsed.command === "extend") {
            return await runInjectedExtendCommand(parsed, sideEffects, loaded);
        }
        return await runInjectedPublishUpdateCommand(parsed, sideEffects, loaded);
    }
    catch (error) {
        if (isCaptchaEncountered(error)) {
            printCaptchaBoundaryMessage(error);
            return CAPTCHA_EXIT_CODE;
        }
        throw error;
    }
    finally {
        removeSignalCleanup();
        await sideEffects?.close?.();
    }
}
