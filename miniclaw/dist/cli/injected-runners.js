import { runDeleteAdsBatch } from "../delete-orchestration.js";
import { runDownloadAdsBatch } from "../download-orchestration.js";
import { runExtendAdsBatch } from "../extend-orchestration.js";
import { saveDataFile } from "../io.js";
import { runPublishAdsBatch, runUpdateAdsBatch, } from "../publish-orchestration.js";
import { ensureDirectory } from "../workspace.js";
import { deleteDoneMessage, downloadDoneMessage, extendDoneMessage, noAdsMessage, printDoneBlock, sideEffectDoneMessage, } from "./messages.js";
import { NUMERIC_IDS_RE } from "./parser.js";
import { loadDownloadCommand, loadSideEffectAds, } from "./loaders.js";
export function hasInjectedPublishUpdateHandlers(command, sideEffects) {
    if (!sideEffects?.fetchPublishedAds) {
        return false;
    }
    if (command === "publish") {
        return !!sideEffects.publishAd;
    }
    if (command === "update") {
        return !!sideEffects.updateAd;
    }
    return false;
}
export async function runInjectedPublishUpdateCommand(parsed, sideEffects, loaded) {
    const { ads, config } = loaded ?? await loadSideEffectAds(parsed);
    if (!ads.length) {
        printDoneBlock(noAdsMessage(parsed.command) ?? "DONE: No ads found.");
        return 0;
    }
    const context = { ads, config, parsed };
    const publishedAds = await sideEffects.fetchPublishedAds(context);
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
            publishAd: sideEffects.publishAd,
        })
        : await runUpdateAdsBatch(ads, {
            ...commonOptions,
            publishAd: sideEffects.updateAd,
        });
    printDoneBlock(sideEffectDoneMessage(parsed.command, result.succeeded, result.failed));
    return 0;
}
export function hasInjectedDeleteHandlers(command, sideEffects) {
    return command === "delete" &&
        !!sideEffects?.fetchPublishedAds &&
        !!sideEffects.deleteAd;
}
export async function runInjectedDeleteCommand(parsed, sideEffects, loaded) {
    const { ads, config } = loaded ?? await loadSideEffectAds(parsed);
    if (!ads.length) {
        printDoneBlock(noAdsMessage(parsed.command) ?? "DONE: No ads found.");
        return 0;
    }
    const context = { ads, config, parsed };
    const publishedAds = await sideEffects.fetchPublishedAds(context);
    const result = await runDeleteAdsBatch(ads, {
        afterDelete: config.deleting.afterDelete,
        deleteAd: sideEffects.deleteAd,
        deleteOldAdsByTitle: config.publishing.deleteOldAdsByTitle,
        publishedAds,
        saveAdConfig: saveDataFile,
    });
    printDoneBlock(deleteDoneMessage(result.deleted, result.processed));
    return 0;
}
export function hasInjectedExtendHandlers(command, sideEffects) {
    return command === "extend" &&
        !!sideEffects?.fetchPublishedAds &&
        !!sideEffects.extendAd;
}
export async function runInjectedExtendCommand(parsed, sideEffects, loaded) {
    const { ads, config } = loaded ?? await loadSideEffectAds(parsed);
    if (!ads.length) {
        printDoneBlock(noAdsMessage(parsed.command) ?? "DONE: No ads found.");
        return 0;
    }
    const context = { ads, config, parsed };
    const publishedAds = await sideEffects.fetchPublishedAds(context);
    const result = await runExtendAdsBatch(ads, {
        extendAd: sideEffects.extendAd,
        publishedAds,
        saveAdConfig: saveDataFile,
    });
    printDoneBlock(extendDoneMessage(result.extended, result.attempted));
    return 0;
}
export function hasInjectedDownloadHandlers(command, sideEffects) {
    return command === "download" &&
        !!sideEffects?.downloadAd &&
        !!sideEffects.extractOwnAdsUrls &&
        !!sideEffects.fetchPublishedAds &&
        !!sideEffects.navigateToAdPage;
}
export async function runInjectedDownloadCommand(parsed, sideEffects, workspace) {
    const { config, downloadDir, effectiveSelector, savedAds } = await loadDownloadCommand(parsed, workspace);
    await ensureDirectory(downloadDir, "downloaded ads directory");
    const strictPublishedAds = NUMERIC_IDS_RE.test(effectiveSelector);
    const context = {
        ads: savedAds,
        config,
        parsed,
        strictPublishedAds,
    };
    const publishedAds = await sideEffects.fetchPublishedAds(context);
    const result = await runDownloadAdsBatch({
        downloadAd: sideEffects.downloadAd,
        downloadDir,
        extractOwnAdsUrls: sideEffects.extractOwnAdsUrls,
        navigateToAdPage: sideEffects.navigateToAdPage,
        publishedAds,
        savedAds,
        selector: effectiveSelector,
    });
    printDoneBlock(downloadDoneMessage(result.selector, result.downloaded, result.targetCount));
    return 0;
}
