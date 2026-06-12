/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type AdInput, type Ad } from "./model/ad-model.js";
import { type AfterDeletePolicy } from "./model/config-model.js";
import {
  type DeleteAdHook,
  type PublishedAdState,
} from "./publish-orchestration.js";
import { type LoadedAd } from "./selection.js";

const RESET_FIELDS = [
  "id",
  "created_on",
  "createdOn",
  "updated_on",
  "updatedOn",
  "content_hash",
  "contentHash",
  "repost_count",
  "repostCount",
  "price_reduction_count",
  "priceReductionCount",
] as const;

export type DeleteBatchEventStatus =
  | "cleanup"
  | "deleted"
  | "not-attempted"
  | "not-found";

export interface DeleteBatchEvent {
  adFile: string;
  adId: number | null;
  relativePath: string;
  status: DeleteBatchEventStatus;
  title: string;
}

export interface DeleteBatchResult {
  cleanupApplied: number;
  deleted: number;
  events: DeleteBatchEvent[];
  processed: number;
  total: number;
}

export interface DeleteAdsBatchOptions {
  afterDelete?: AfterDeletePolicy;
  deleteAd: DeleteAdHook;
  deleteOldAdsByTitle?: boolean;
  publishedAds?: readonly PublishedAdState[];
  saveAdConfig?: (adFile: string, adConfig: AdInput) => Promise<void> | void;
  sleep?: () => Promise<void> | void;
}

function deleteEvent(
  loadedAd: LoadedAd,
  status: DeleteBatchEventStatus,
): DeleteBatchEvent {
  return {
    adFile: loadedAd.filePath,
    adId: loadedAd.ad.id,
    relativePath: loadedAd.relativePath,
    status,
    title: loadedAd.ad.title,
  };
}

export function applyAfterDeletePolicy(
  ad: Ad,
  raw: AdInput,
  mode: AfterDeletePolicy,
): boolean {
  if (mode === "NONE") {
    return false;
  }

  if (mode === "RESET") {
    for (const field of RESET_FIELDS) {
      delete raw[field];
    }
    ad.id = null;
    ad.createdOn = null;
    ad.updatedOn = null;
    ad.contentHash = null;
    ad.repostCount = 0;
    ad.priceReductionCount = 0;
    return true;
  }

  if (mode === "DISABLE") {
    ad.active = false;
    raw.active = false;
    return true;
  }

  return false;
}

export async function runDeleteAdsBatch(
  loadedAds: readonly LoadedAd[],
  {
    afterDelete = "NONE",
    deleteAd,
    deleteOldAdsByTitle = false,
    publishedAds = [],
    saveAdConfig,
    sleep,
  }: DeleteAdsBatchOptions,
): Promise<DeleteBatchResult> {
  const result: DeleteBatchResult = {
    cleanupApplied: 0,
    deleted: 0,
    events: [],
    processed: 0,
    total: loadedAds.length,
  };

  for (const loadedAd of loadedAds) {
    result.processed += 1;
    const idBefore = loadedAd.ad.id;
    const deleted = Boolean(await deleteAd({
      ad: loadedAd.ad,
      adFile: loadedAd.filePath,
      deleteOldAdsByTitle,
      publishedAds,
      raw: loadedAd.raw,
      relativePath: loadedAd.relativePath,
    }));
    if (deleted) {
      result.deleted += 1;
      result.events.push(deleteEvent(loadedAd, "deleted"));
    }

    const deleteAttempted = deleted ||
      (idBefore !== null && loadedAd.ad.id === null);
    if (deleteAttempted && afterDelete !== "NONE") {
      if (applyAfterDeletePolicy(loadedAd.ad, loadedAd.raw, afterDelete)) {
        result.cleanupApplied += 1;
        result.events.push(deleteEvent(loadedAd, "cleanup"));
        if (saveAdConfig) {
          await saveAdConfig(loadedAd.filePath, loadedAd.raw);
        }
      }
    } else if (!deleted) {
      result.events.push(deleteEvent(
        loadedAd,
        deleteAttempted ? "not-found" : "not-attempted",
      ));
    }

    if (sleep) {
      await sleep();
    }
  }

  return result;
}
