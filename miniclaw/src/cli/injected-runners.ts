import { runDeleteAdsBatch } from "../delete-orchestration.js";
import { runDownloadAdsBatch } from "../download-orchestration.js";
import { runExtendAdsBatch } from "../extend-orchestration.js";
import { saveDataFile } from "../io.js";
import { isNumericIdSelector } from "../ad-selector.js";
import {
  type PublishedAdState,
  runPublishAdsBatch,
  runUpdateAdsBatch,
} from "../publish-orchestration.js";
import { ensureDirectory, type Workspace } from "../workspace.js";
import {
  deleteDoneMessage,
  downloadDoneMessage,
  extendDoneMessage,
  noAdsMessage,
  printDoneBlock,
  sideEffectDoneMessage,
} from "./messages.js";
import {
  loadDownloadCommand,
  loadSideEffectAds,
  type LoadedSideEffectAds,
} from "./loaders.js";
import {
  type Command,
  type ParsedArgs,
  type SideEffectCommandContext,
  type SideEffectHandlers,
} from "./types.js";

interface LoadedInjectedSideEffectContext extends LoadedSideEffectAds {
  publishedAds: readonly PublishedAdState[];
}

async function loadInjectedSideEffectContext(
  parsed: ParsedArgs,
  sideEffects: SideEffectHandlers,
  loaded?: LoadedSideEffectAds,
): Promise<LoadedInjectedSideEffectContext | null> {
  const { ads, config } = loaded ?? await loadSideEffectAds(parsed);
  if (!ads.length) {
    printDoneBlock(noAdsMessage(parsed.command) ?? "DONE: No ads found.");
    return null;
  }

  const context: SideEffectCommandContext = { ads, config, parsed };
  const publishedAds = await sideEffects.fetchPublishedAds!(context);
  return { ads, config, publishedAds };
}

function hasSideEffectHandlers(
  sideEffects: SideEffectHandlers | undefined,
  names: readonly (keyof SideEffectHandlers)[],
): boolean {
  return names.every((name) => !!sideEffects?.[name]);
}

export function hasInjectedPublishUpdateHandlers(
  command: Command | string,
  sideEffects: SideEffectHandlers | undefined,
): boolean {
  if (!hasSideEffectHandlers(sideEffects, ["fetchPublishedAds"])) {
    return false;
  }
  if (command === "publish") {
    return !!sideEffects?.publishAd;
  }
  if (command === "update") {
    return !!sideEffects?.updateAd;
  }
  return false;
}

export async function runInjectedPublishUpdateCommand(
  parsed: ParsedArgs,
  sideEffects: SideEffectHandlers,
  loaded?: LoadedSideEffectAds,
): Promise<number> {
  const loadedContext = await loadInjectedSideEffectContext(
    parsed,
    sideEffects,
    loaded,
  );
  if (!loadedContext) {
    return 0;
  }
  const { ads, config, publishedAds } = loadedContext;

  const commonOptions = {
    captureError: sideEffects.captureError,
    publishedAds,
    sleep: sideEffects.sleep,
    waitForPublishingResult: sideEffects.waitForPublishingResult,
  };
  const result = parsed.command === "publish"
    ? await runPublishAdsBatch(ads, {
      ...commonOptions,
      deleteAd: sideEffects.deleteAd,
      deleteOldAds: config.publishing.deleteOldAds,
      deleteOldAdsByTitle: config.publishing.deleteOldAdsByTitle,
      keepOldAds: parsed.keepOldAds,
      publishAd: sideEffects.publishAd!,
    })
    : await runUpdateAdsBatch(ads, {
      ...commonOptions,
      publishAd: sideEffects.updateAd!,
    });

  printDoneBlock(
    sideEffectDoneMessage(parsed.command, result.succeeded, result.failed),
  );
  return 0;
}

export function hasInjectedDeleteHandlers(
  command: Command | string,
  sideEffects: SideEffectHandlers | undefined,
): boolean {
  return command === "delete" &&
    hasSideEffectHandlers(sideEffects, ["fetchPublishedAds", "deleteAd"]);
}

export async function runInjectedDeleteCommand(
  parsed: ParsedArgs,
  sideEffects: SideEffectHandlers,
  loaded?: LoadedSideEffectAds,
): Promise<number> {
  const loadedContext = await loadInjectedSideEffectContext(
    parsed,
    sideEffects,
    loaded,
  );
  if (!loadedContext) {
    return 0;
  }
  const { ads, config, publishedAds } = loadedContext;

  const result = await runDeleteAdsBatch(ads, {
    afterDelete: config.deleting.afterDelete,
    deleteAd: sideEffects.deleteAd!,
    deleteOldAdsByTitle: config.publishing.deleteOldAdsByTitle,
    publishedAds,
    saveAdConfig: saveDataFile,
  });

  printDoneBlock(deleteDoneMessage(result.deleted, result.processed));
  return 0;
}

export function hasInjectedExtendHandlers(
  command: Command | string,
  sideEffects: SideEffectHandlers | undefined,
): boolean {
  return command === "extend" &&
    hasSideEffectHandlers(sideEffects, ["fetchPublishedAds", "extendAd"]);
}

export async function runInjectedExtendCommand(
  parsed: ParsedArgs,
  sideEffects: SideEffectHandlers,
  loaded?: LoadedSideEffectAds,
): Promise<number> {
  const loadedContext = await loadInjectedSideEffectContext(
    parsed,
    sideEffects,
    loaded,
  );
  if (!loadedContext) {
    return 0;
  }
  const { ads, publishedAds } = loadedContext;

  const result = await runExtendAdsBatch(ads, {
    extendAd: sideEffects.extendAd!,
    publishedAds,
    saveAdConfig: saveDataFile,
  });

  printDoneBlock(extendDoneMessage(result.extended, result.attempted));
  return 0;
}

export function hasInjectedDownloadHandlers(
  command: Command | string,
  sideEffects: SideEffectHandlers | undefined,
): boolean {
  return command === "download" &&
    hasSideEffectHandlers(sideEffects, [
      "downloadAd",
      "extractOwnAdsUrls",
      "fetchPublishedAds",
      "navigateToAdPage",
    ]);
}

export async function runInjectedDownloadCommand(
  parsed: ParsedArgs,
  sideEffects: SideEffectHandlers,
  workspace: Workspace,
): Promise<number> {
  const { config, downloadDir, effectiveSelector, savedAds } =
    await loadDownloadCommand(parsed, workspace);
  await ensureDirectory(downloadDir, "downloaded ads directory");

  const strictPublishedAds = isNumericIdSelector(effectiveSelector);
  const context: SideEffectCommandContext = {
    ads: savedAds,
    config,
    parsed,
    strictPublishedAds,
  };
  const publishedAds = await sideEffects.fetchPublishedAds!(context);
  const result = await runDownloadAdsBatch({
    downloadAd: sideEffects.downloadAd!,
    downloadDir,
    extractOwnAdsUrls: sideEffects.extractOwnAdsUrls!,
    navigateToAdPage: sideEffects.navigateToAdPage!,
    publishedAds,
    savedAds,
    selector: effectiveSelector,
  });

  printDoneBlock(
    downloadDoneMessage(
      result.selector,
      result.downloaded,
      result.targetCount,
    ),
  );
  return 0;
}
