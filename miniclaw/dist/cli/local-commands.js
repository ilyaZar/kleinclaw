import fs from "node:fs/promises";
import path from "node:path";
import { buildBrowserDiagnosticReport } from "../browser.js";
import { loadConfigFile, saveDataFile } from "../io.js";
import { AdUpdateStrategy, contentHashForLoadedAd, evaluateAutoPriceReduction, } from "../model/ad-model.js";
import { loadSelectedAds } from "../selection.js";
import { inspectLocalUpdateCheck } from "../update-check.js";
import { DEFAULT_CONFIG } from "./help.js";
import { printDiagnosticLine, printDoneBlock } from "./messages.js";
export async function createDefaultConfig(configPath) {
    try {
        await fs.access(configPath);
        console.error(`Config file ${configPath} already exists. Aborting creation.`);
        return 0;
    }
    catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, DEFAULT_CONFIG, { encoding: "utf8", mode: 0o600 });
    console.error(`Saving ${configPath}`);
    return 0;
}
function previewDecision(label, adFile, reason) {
    console.error(`Auto price reduction preview for [${adFile}] (${label}): ${reason}`);
}
export async function verifyConfig(parsed) {
    const config = await loadConfigFile(parsed.configPath);
    const ads = await loadSelectedAds({
        configPath: parsed.configPath,
        config,
        selector: "all",
        excludeAdsWithId: false,
    });
    for (const { ad, filePath } of ads) {
        const priceState = {
            price: ad.price,
            autoPriceReduction: ad.autoPriceReduction,
            priceReductionCount: ad.priceReductionCount,
            repostCount: ad.repostCount,
            updatedOn: ad.updatedOn,
            createdOn: ad.createdOn,
        };
        const publishDecision = evaluateAutoPriceReduction(priceState, {
            mode: AdUpdateStrategy.Replace,
        });
        const updateDecision = evaluateAutoPriceReduction(priceState, {
            mode: AdUpdateStrategy.Modify,
        });
        if (publishDecision.enabled) {
            previewDecision("publish", filePath, publishDecision.reason);
        }
        if (updateDecision.enabled) {
            previewDecision("update", filePath, updateDecision.reason);
        }
    }
    printDoneBlock("DONE: No configuration errors found.");
    return 0;
}
export async function updateContentHashes(parsed) {
    const config = await loadConfigFile(parsed.configPath);
    const ads = await loadSelectedAds({
        configPath: parsed.configPath,
        config,
        selector: "all",
        excludeAdsWithId: false,
    });
    if (!ads.length) {
        printDoneBlock("DONE: No active ads found.");
        return 0;
    }
    let changed = 0;
    for (const { ad, filePath, raw } of ads) {
        const contentHash = contentHashForLoadedAd(ad);
        if (raw.content_hash !== contentHash) {
            raw.content_hash = contentHash;
            await saveDataFile(filePath, raw);
            changed += 1;
        }
    }
    const noun = changed === 1 ? "ad" : "ads";
    printDoneBlock(`DONE: Updated [content_hash] in ${changed} ${noun}`);
    return 0;
}
export async function runUpdateCheck(parsed, workspace) {
    const config = await loadConfigFile(parsed.configPath);
    const result = await inspectLocalUpdateCheck({
        config,
        stateFile: path.join(workspace.stateDir, "update_check_state.json"),
        skipIntervalCheck: true,
    });
    if (!result.enabled) {
        printDoneBlock("DONE: update check disabled.");
        return 0;
    }
    if (!result.shouldCheck) {
        printDoneBlock("DONE: update check skipped until interval elapses.");
        return 0;
    }
    printDoneBlock("DONE: update check network request skipped by local-only build.");
    return 0;
}
export async function runDiagnose(parsed) {
    const config = await loadConfigFile(parsed.configPath);
    const report = buildBrowserDiagnosticReport(config);
    for (const line of report.lines) {
        printDiagnosticLine(line.status, line.message);
    }
    return 0;
}
