import { loadConfigFile } from "../io.js";
import { loadSelectedAds } from "../selection.js";
import { noAdsMessage } from "./messages.js";
import { prepareCommand } from "./parser.js";
function planAd(ad) {
    return {
        relativePath: ad.relativePath,
        title: ad.ad.title,
        id: ad.ad.id,
        active: ad.ad.active,
    };
}
export async function planCommand(parsed, { now = new Date() } = {}) {
    const prepared = prepareCommand(parsed);
    if (!prepared.ok) {
        throw new Error(prepared.error ?? "command preparation failed");
    }
    const basePlan = {
        command: parsed.command,
        adsSelector: prepared.adsSelector,
        selectedAds: [],
    };
    if (parsed.command === "download") {
        return {
            ...basePlan,
            loadAds: false,
            excludeAdsWithId: null,
            selectedCount: null,
            needsBrowser: true,
            doneMessage: null,
        };
    }
    const loadAdsCommands = new Set([
        "verify",
        "update-content-hash",
        "publish",
        "update",
        "delete",
        "extend",
    ]);
    if (!loadAdsCommands.has(parsed.command)) {
        return {
            ...basePlan,
            loadAds: false,
            excludeAdsWithId: null,
            selectedCount: null,
            needsBrowser: false,
            doneMessage: null,
        };
    }
    const excludeAdsWithId = parsed.command === "verify" || parsed.command === "update-content-hash"
        ? false
        : true;
    const config = await loadConfigFile(parsed.configPath);
    const ads = await loadSelectedAds({
        configPath: parsed.configPath,
        config,
        selector: prepared.adsSelector,
        excludeAdsWithId,
        now,
    });
    const needsBrowser = ["publish", "update", "delete", "extend"].includes(parsed.command) && ads.length > 0;
    return {
        ...basePlan,
        loadAds: true,
        excludeAdsWithId,
        selectedCount: ads.length,
        selectedAds: ads.map(planAd),
        needsBrowser,
        doneMessage: ads.length === 0 ? noAdsMessage(parsed.command) : null,
    };
}
