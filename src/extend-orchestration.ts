/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { idsMatch } from "./ad-identity.js";
import { type AdInput, type Ad } from "./model/ad-model.js";
import { type PublishedAdState } from "./publish-orchestration.js";
import { type LoadedAd } from "./selection.js";

export const EXTEND_WINDOW_DAYS = 8;

export interface ExtendPublishedAdState extends PublishedAdState {
  endDate?: unknown;
}

export interface ExtendAdContext {
  ad: Ad;
  adFile: string;
  publishedAd: ExtendPublishedAdState;
  raw: LoadedAd["raw"];
  relativePath: string;
}

export type ExtendAdHook = (
  context: ExtendAdContext,
) => Promise<boolean | void> | boolean | void;

export type ExtendBatchEventStatus =
  | "extended"
  | "failed"
  | "skipped-end-date"
  | "skipped-inactive"
  | "skipped-missing"
  | "skipped-outside-window"
  | "skipped-unpublished";

export interface ExtendBatchEvent {
  adFile: string;
  adId: number | null;
  daysUntilExpiry?: number;
  relativePath: string;
  status: ExtendBatchEventStatus;
  title: string;
}

export interface ExtendBatchResult {
  attempted: number;
  events: ExtendBatchEvent[];
  extended: number;
  skipped: number;
  total: number;
}

export interface ExtendAdsBatchOptions {
  extendAd: ExtendAdHook;
  now?: Date;
  publishedAds?: readonly ExtendPublishedAdState[];
  saveAdConfig?: (adFile: string, adConfig: AdInput) => Promise<void> | void;
  sleep?: () => Promise<void> | void;
}

function findPublishedAd(
  ad: Ad,
  publishedAds: readonly ExtendPublishedAdState[],
): ExtendPublishedAdState | null {
  return publishedAds.find((publishedAd) => idsMatch(ad.id, publishedAd.id)) ?? null;
}

function utcDateOnlyMillis(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

export function parseGermanDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const year = Number.parseInt(match[3]!, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function daysUntilEndDate(
  endDate: Date,
  now = new Date(),
): number {
  const millisPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (utcDateOnlyMillis(endDate) - utcDateOnlyMillis(now)) / millisPerDay,
  );
}

function formatUtcIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function eventFor(
  loadedAd: LoadedAd,
  status: ExtendBatchEventStatus,
  daysUntilExpiry?: number,
): ExtendBatchEvent {
  const event: ExtendBatchEvent = {
    adFile: loadedAd.filePath,
    adId: loadedAd.ad.id,
    relativePath: loadedAd.relativePath,
    status,
    title: loadedAd.ad.title,
  };
  if (daysUntilExpiry !== undefined) {
    event.daysUntilExpiry = daysUntilExpiry;
  }
  return event;
}

function markSkipped(
  result: ExtendBatchResult,
  loadedAd: LoadedAd,
  status: ExtendBatchEventStatus,
  daysUntilExpiry?: number,
): void {
  result.skipped += 1;
  result.events.push(eventFor(loadedAd, status, daysUntilExpiry));
}

export async function runExtendAdsBatch(
  loadedAds: readonly LoadedAd[],
  {
    extendAd,
    now = new Date(),
    publishedAds = [],
    saveAdConfig,
    sleep,
  }: ExtendAdsBatchOptions,
): Promise<ExtendBatchResult> {
  const result: ExtendBatchResult = {
    attempted: 0,
    events: [],
    extended: 0,
    skipped: 0,
    total: loadedAds.length,
  };

  for (const loadedAd of loadedAds) {
    if (!loadedAd.ad.id) {
      markSkipped(result, loadedAd, "skipped-unpublished");
      continue;
    }

    const publishedAd = findPublishedAd(loadedAd.ad, publishedAds);
    if (!publishedAd) {
      markSkipped(result, loadedAd, "skipped-missing");
      continue;
    }
    if (publishedAd.state !== "active") {
      markSkipped(result, loadedAd, "skipped-inactive");
      continue;
    }

    const endDate = parseGermanDate(publishedAd.endDate);
    if (!endDate) {
      markSkipped(result, loadedAd, "skipped-end-date");
      continue;
    }

    const daysUntilExpiry = daysUntilEndDate(endDate, now);
    if (daysUntilExpiry > EXTEND_WINDOW_DAYS) {
      markSkipped(
        result,
        loadedAd,
        "skipped-outside-window",
        daysUntilExpiry,
      );
      continue;
    }

    result.attempted += 1;
    const extended = Boolean(await extendAd({
      ad: loadedAd.ad,
      adFile: loadedAd.filePath,
      publishedAd,
      raw: loadedAd.raw,
      relativePath: loadedAd.relativePath,
    }));
    if (extended) {
      loadedAd.raw.updated_on = formatUtcIsoSeconds(now);
      loadedAd.ad.updatedOn = now;
      if (saveAdConfig) {
        try {
          await saveAdConfig(loadedAd.filePath, loadedAd.raw);
        } catch {
          result.events.push(eventFor(loadedAd, "failed", daysUntilExpiry));
          if (sleep) {
            await sleep();
          }
          continue;
        }
      }
      result.extended += 1;
      result.events.push(eventFor(loadedAd, "extended", daysUntilExpiry));
    } else {
      result.events.push(eventFor(loadedAd, "failed", daysUntilExpiry));
    }

    if (sleep) {
      await sleep();
    }
  }

  return result;
}
