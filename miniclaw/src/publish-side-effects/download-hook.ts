/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  DownloadAdExtractor,
  type DownloadExtractorController,
} from "../download-extractor.js";
import {
  type DownloadAdContext,
  type NavigateToAdPageHook,
} from "../download-orchestration.js";
import { type Config } from "../model/config-model.js";
import {
  By,
  TimeoutError,
  type WebLocator,
} from "../web-primitives.js";

interface DownloadBrowserController extends DownloadExtractorController {
  webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
  webOpen(
    url: string,
    options?: { timeout?: number; reloadIfAlreadyOpen?: boolean },
  ): Promise<void>;
  webSleep(minMs?: number, maxMs?: number): Promise<void>;
}

export async function navigateToDownloadedAdPage(
  controller: DownloadBrowserController,
  rootUrl: string,
  context: Parameters<NavigateToAdPageHook>[0],
): Promise<boolean> {
  const pageUrl = context.adUrl ??
    `${rootUrl}/s-suchanfrage.html?keywords=${context.adId}`;
  await controller.webOpen(pageUrl);
  await controller.webSleep();

  if (controller.page?.url?.endsWith("k0")) {
    return false;
  }

  try {
    await controller.webFind(By.ID, "vap-ovrly-secure");
    await controller.webClick(By.CLASS_NAME, "mfp-close");
    await controller.webSleep();
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }
  return true;
}

export async function downloadAdWithBrowser(
  config: Config,
  controller: DownloadExtractorController,
  context: DownloadAdContext,
): Promise<void> {
  await new DownloadAdExtractor({
    config,
    controller,
    downloadDir: context.downloadDir,
    publishedAdsById: context.publishedAd
      ? new Map([[context.adId, context.publishedAd]])
      : undefined,
  }).downloadAd(context.adId, { active: context.active });
}
