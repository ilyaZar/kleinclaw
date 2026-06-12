/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  extractAdIdFromAdUrl,
  publishedAdId,
} from "./ad-identity.js";
import { type PublishedAdState } from "./publish-orchestration.js";
import { type LoadedAd } from "./selection.js";

export { extractAdIdFromAdUrl } from "./ad-identity.js";

const NUMERIC_IDS_RE = /^\d+(,\d+)*$/;

export interface DownloadPublishedAdState extends PublishedAdState {}

export interface ResolvedDownloadAdActivity {
  active: boolean;
  owned: boolean;
  publishedAd: DownloadPublishedAdState | null;
}

export interface DownloadAdContext extends ResolvedDownloadAdActivity {
  adId: number;
  adUrl: string | null;
  downloadDir: string;
  source: DownloadSelectorMode;
}

export interface DownloadNavigationContext {
  adId: number;
  adUrl: string | null;
  source: DownloadSelectorMode;
}

export interface ExtractOwnAdsUrlsContext {
  downloadDir: string;
}

export type DownloadAdHook = (
  context: DownloadAdContext,
) => Promise<void> | void;

export type ExtractOwnAdsUrlsHook = (
  context: ExtractOwnAdsUrlsContext,
) => Promise<readonly string[]> | readonly string[];

export type NavigateToAdPageHook = (
  context: DownloadNavigationContext,
) => Promise<boolean | void> | boolean | void;

export type DownloadSelectorMode = "all" | "new" | "numeric";

export type DownloadBatchEventStatus =
  | "downloaded"
  | "skipped-invalid-id"
  | "skipped-navigation"
  | "skipped-saved";

export interface DownloadBatchEvent {
  adId: number | null;
  adUrl: string | null;
  source: DownloadSelectorMode;
  status: DownloadBatchEventStatus;
}

export interface DownloadBatchResult {
  downloaded: number;
  events: DownloadBatchEvent[];
  selector: string;
  skipped: number;
  targetCount: number;
  total: number;
}

export interface DownloadAdsBatchOptions {
  downloadAd: DownloadAdHook;
  downloadDir: string;
  extractOwnAdsUrls: ExtractOwnAdsUrlsHook;
  navigateToAdPage: NavigateToAdPageHook;
  publishedAds?: readonly DownloadPublishedAdState[];
  savedAds?: readonly LoadedAd[];
  selector: string;
}

export function normalizeDownloadSelector(selector: string): string {
  const selectorTokens = new Set(
    selector.split(",").map((entry) => entry.trim()).filter(Boolean),
  );
  if (selectorTokens.has("all")) {
    return "all";
  }
  if (selectorTokens.size === 1) {
    return [...selectorTokens][0] ?? selector;
  }
  return selector;
}

export function publishedAdsById(
  publishedAds: readonly DownloadPublishedAdState[],
): Map<number, DownloadPublishedAdState> {
  const adsById = new Map<number, DownloadPublishedAdState>();
  for (const publishedAd of publishedAds) {
    const adId = publishedAdId(publishedAd.id);
    if (adId !== null) {
      adsById.set(adId, publishedAd);
    }
  }
  return adsById;
}

export function resolveDownloadAdActivity(
  adId: number,
  adsById: ReadonlyMap<number, DownloadPublishedAdState>,
): ResolvedDownloadAdActivity {
  const publishedAd = adsById.get(adId) ?? null;
  if (!publishedAd) {
    return { active: false, owned: false, publishedAd: null };
  }
  return {
    active: publishedAd.state === "active",
    owned: true,
    publishedAd,
  };
}

function savedAdIds(savedAds: readonly LoadedAd[]): Set<number> {
  const ids = new Set<number>();
  for (const savedAd of savedAds) {
    if (savedAd.ad.id !== null) {
      ids.add(savedAd.ad.id);
    }
  }
  return ids;
}

function event(
  source: DownloadSelectorMode,
  status: DownloadBatchEventStatus,
  adId: number | null,
  adUrl: string | null,
): DownloadBatchEvent {
  return { adId, adUrl, source, status };
}

async function downloadResolvedAd(
  {
    adId,
    adUrl,
    adsById,
    downloadAd,
    downloadDir,
    navigateToAdPage,
    result,
    source,
  }: {
    adId: number;
    adUrl: string | null;
    adsById: ReadonlyMap<number, DownloadPublishedAdState>;
    downloadAd: DownloadAdHook;
    downloadDir: string;
    navigateToAdPage: NavigateToAdPageHook;
    result: DownloadBatchResult;
    source: DownloadSelectorMode;
  },
): Promise<void> {
  result.targetCount += 1;
  const exists = await navigateToAdPage({ adId, adUrl, source });
  if (!exists) {
    result.skipped += 1;
    result.events.push(event(source, "skipped-navigation", adId, adUrl));
    return;
  }

  const resolved = resolveDownloadAdActivity(adId, adsById);
  await downloadAd({
    ...resolved,
    adId,
    adUrl,
    downloadDir,
    source,
  });
  result.downloaded += 1;
  result.events.push(event(source, "downloaded", adId, adUrl));
}

async function runOverviewDownload(
  selector: "all" | "new",
  result: DownloadBatchResult,
  {
    downloadAd,
    downloadDir,
    extractOwnAdsUrls,
    navigateToAdPage,
    publishedAds = [],
    savedAds = [],
  }: DownloadAdsBatchOptions,
): Promise<void> {
  const adsById = publishedAdsById(publishedAds);
  const ownAdUrls = await extractOwnAdsUrls({ downloadDir });
  const savedIds = selector === "new" ? savedAdIds(savedAds) : new Set<number>();
  result.total = ownAdUrls.length;

  for (const adUrl of ownAdUrls) {
    const adId = extractAdIdFromAdUrl(adUrl);
    if (adId === -1) {
      result.skipped += 1;
      result.events.push(event(selector, "skipped-invalid-id", null, adUrl));
      continue;
    }
    if (savedIds.has(adId)) {
      result.skipped += 1;
      result.events.push(event(selector, "skipped-saved", adId, adUrl));
      continue;
    }
    await downloadResolvedAd({
      adId,
      adUrl,
      adsById,
      downloadAd,
      downloadDir,
      navigateToAdPage,
      result,
      source: selector,
    });
  }
}

async function runNumericDownload(
  selector: string,
  result: DownloadBatchResult,
  {
    downloadAd,
    downloadDir,
    navigateToAdPage,
    publishedAds = [],
  }: DownloadAdsBatchOptions,
): Promise<void> {
  const adsById = publishedAdsById(publishedAds);
  const ids = selector.split(",").map((entry) => Number.parseInt(entry, 10));
  result.total = ids.length;

  for (const adId of ids) {
    await downloadResolvedAd({
      adId,
      adUrl: null,
      adsById,
      downloadAd,
      downloadDir,
      navigateToAdPage,
      result,
      source: "numeric",
    });
  }
}

export async function runDownloadAdsBatch(
  options: DownloadAdsBatchOptions,
): Promise<DownloadBatchResult> {
  const selector = normalizeDownloadSelector(options.selector);
  const result: DownloadBatchResult = {
    downloaded: 0,
    events: [],
    selector,
    skipped: 0,
    targetCount: 0,
    total: 0,
  };

  if (selector === "all" || selector === "new") {
    await runOverviewDownload(selector, result, options);
    return result;
  }
  if (NUMERIC_IDS_RE.test(selector)) {
    await runNumericDownload(selector, result, options);
  }
  return result;
}
