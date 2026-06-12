import path from "node:path";

import { normalizeDownloadSelector } from "../download-orchestration.js";
import { loadConfigFile } from "../io.js";
import { type Config } from "../model/config-model.js";
import { type LoadedAd, loadSelectedAds } from "../selection.js";
import { type Workspace } from "../workspace.js";
import { type ParsedArgs } from "./types.js";

export interface LoadedSideEffectAds {
  ads: LoadedAd[];
  config: Config;
}

export interface LoadedDownloadCommand {
  config: Config;
  downloadDir: string;
  effectiveSelector: string;
  savedAds: LoadedAd[];
}

export async function loadSideEffectAds(
  parsed: ParsedArgs,
): Promise<LoadedSideEffectAds> {
  const config = await loadConfigFile(parsed.configPath);
  const ads = await loadSelectedAds({
    configPath: parsed.configPath,
    config,
    selector: parsed.adsSelector,
    excludeAdsWithId: true,
  });
  return { ads, config };
}

export function resolveDownloadDir(
  config: Config,
  configPath: string,
  workspace: Workspace,
): string {
  const trimmedDir = config.download.dir.trim();
  if (trimmedDir === "downloaded-ads") {
    return workspace.downloadDir;
  }
  return path.resolve(path.dirname(configPath), trimmedDir);
}

export async function loadDownloadCommand(
  parsed: ParsedArgs,
  workspace: Workspace,
): Promise<LoadedDownloadCommand> {
  const config = await loadConfigFile(parsed.configPath);
  const effectiveSelector = normalizeDownloadSelector(parsed.adsSelector);
  const savedAds = effectiveSelector === "new"
    ? await loadSelectedAds({
      configPath: parsed.configPath,
      config,
      selector: "all",
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
