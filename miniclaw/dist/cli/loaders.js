import path from "node:path";
import { normalizeDownloadSelector } from "../download-orchestration.js";
import { loadConfigFile } from "../io.js";
import { loadSelectedAds } from "../selection.js";
export async function loadSideEffectAds(parsed) {
    const config = await loadConfigFile(parsed.configPath);
    const ads = await loadSelectedAds({
        configPath: parsed.configPath,
        config,
        selector: parsed.adsSelector,
        adFileOverrides: parsed.adFileOverrides,
        excludeAdsWithId: true,
    });
    return { ads, config };
}
export function resolveDownloadDir(config, configPath, workspace) {
    const trimmedDir = config.download.dir.trim();
    if (trimmedDir === "downloaded-ads") {
        return workspace.downloadDir;
    }
    return path.resolve(path.dirname(configPath), trimmedDir);
}
export async function loadDownloadCommand(parsed, workspace) {
    const config = await loadConfigFile(parsed.configPath);
    const effectiveSelector = normalizeDownloadSelector(parsed.adsSelector);
    const savedAds = effectiveSelector === "new"
        ? await loadSelectedAds({
            configPath: parsed.configPath,
            config,
            selector: "all",
            adFileOverrides: parsed.adFileOverrides,
            ignoreInactive: false,
            excludeAdsWithId: false,
        })
        : [];
    return {
        config,
        downloadDir: resolveDownloadDir(config, parsed.configPath, workspace),
        effectiveSelector,
        savedAds,
    };
}
