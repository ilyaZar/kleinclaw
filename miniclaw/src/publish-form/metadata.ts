/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  AdUpdateStrategy,
  contentHashForAd,
  type Ad,
} from "../model/ad-model.js";

function formatUtcIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

export function updateAdConfigAfterPublish(
  adConfig: Record<string, unknown>,
  ad: Pick<
    Ad,
    "createdOn" | "id" | "priceReductionCount" | "repostCount"
  >,
  adId: number,
  mode: AdUpdateStrategy = AdUpdateStrategy.Replace,
  now: Date = new Date(),
): Record<string, unknown> {
  adConfig.id = adId;
  adConfig.content_hash = contentHashForAd(adConfig);
  adConfig.updated_on = formatUtcIsoSeconds(now);

  if (!ad.createdOn && !ad.id) {
    adConfig.created_on = adConfig.updated_on;
  }

  if (mode === AdUpdateStrategy.Replace) {
    const currentReposts = Number(adConfig.repost_count ?? ad.repostCount ?? 0);
    adConfig.repost_count = Number.isFinite(currentReposts)
      ? currentReposts + 1
      : 1;
  }

  if (ad.priceReductionCount > 0) {
    adConfig.price_reduction_count = ad.priceReductionCount;
  }

  return adConfig;
}
