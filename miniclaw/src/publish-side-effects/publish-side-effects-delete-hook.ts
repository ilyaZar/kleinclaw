/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type Ad } from "../model/ad-model.js";
import { type DeleteAdHook } from "../publish-orchestration.js";
import { type WebResponse } from "../web-primitives.js";
import { callPageScript, CSRF_TOKEN_SCRIPT } from "../web/page-scripts.js";

interface DeletePublishedAdController {
  webExecute(jscode: string): Promise<unknown>;
  webOpen(url: string): Promise<void>;
  webRequest(
    url: string,
    method?: string,
    validResponseCodes?: number | Iterable<number>,
    headers?: Record<string, string> | null,
  ): Promise<WebResponse>;
  webSleep(minMs?: number, maxMs?: number): Promise<void>;
}

function publishedAdId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// An ad with an ID deletes exactly that ID. Title matching only applies to
// ID-less ads and fails closed when the title matches several published ads.
export function deletionTargetIds(
  ad: Pick<Ad, "id" | "title">,
  publishedAds: readonly Record<string, unknown>[],
  deleteOldAdsByTitle: boolean,
): number[] {
  if (ad.id !== null) {
    return [ad.id];
  }
  if (!deleteOldAdsByTitle) {
    return [];
  }
  const ids = new Set<number>();
  for (const publishedAd of publishedAds) {
    const id = publishedAdId(publishedAd.id);
    if (id !== null && publishedAd.title === ad.title) {
      ids.add(id);
    }
  }
  return ids.size === 1 ? [...ids] : [];
}

export async function deletePublishedAd(
  controller: DeletePublishedAdController,
  rootUrl: string,
  {
    ad,
    deleteOldAdsByTitle,
    publishedAds,
  }: Parameters<DeleteAdHook>[0],
): Promise<boolean> {
  const targetIds = deletionTargetIds(
    ad,
    publishedAds as readonly Record<string, unknown>[],
    deleteOldAdsByTitle,
  );
  if (targetIds.length === 0) {
    return false;
  }

  await controller.webOpen(`${rootUrl}/m-meine-anzeigen.html`);
  const csrfToken = await controller.webExecute(callPageScript(CSRF_TOKEN_SCRIPT));
  if (typeof csrfToken !== "string" || !csrfToken.trim()) {
    throw new Error("Expected CSRF Token not found in HTML content!");
  }

  let deleted = false;
  for (const targetId of targetIds) {
    const response = await controller.webRequest(
      `${rootUrl}/m-anzeigen-loeschen.json?ids=${targetId}`,
      "POST",
      [200, 404],
      { "x-csrf-token": csrfToken },
    );
    if (response.statusCode === 200) {
      deleted = true;
    }
  }

  ad.id = null;
  await controller.webSleep();
  return deleted;
}
