/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type ExtendAdContext } from "../extend-orchestration.js";
import { By, TimeoutError, type WebElement, type WebLocator } from "../web-primitives.js";
import { navigatePaginatedAdOverview } from "./ad-overview.js";

interface ExtendPublishedAdController {
  webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
  webFind(
    type: By,
    value: string,
    options?: { parent?: WebLocator | null; timeout?: number },
  ): Promise<WebLocator>;
  webFindAll(
    type: By,
    value: string,
    options?: { parent?: WebLocator | null; timeout?: number },
  ): Promise<WebElement[]>;
  webOpen(url: string): Promise<void>;
  webSleep(minMs?: number, maxMs?: number): Promise<void>;
}

export async function extendPublishedAd(
  controller: ExtendPublishedAdController,
  rootUrl: string,
  context: ExtendAdContext,
  {
    paginationFollowUpTimeout,
    paginationInitialTimeout,
    quickDomTimeout,
  }: {
    paginationFollowUpTimeout?: number;
    paginationInitialTimeout?: number;
    quickDomTimeout?: number;
  } = {},
): Promise<boolean> {
  if (!context.ad.id) {
    return false;
  }

  const extendButtonXPath =
    `//li[@data-adid="${context.ad.id}"]//button[contains(., "Verlängern")]`;
  const success = await navigatePaginatedAdOverview(
    controller,
    `${rootUrl}/m-meine-anzeigen.html`,
    async () => {
      const extendButton = await controller.webFind(
        By.XPATH,
        extendButtonXPath,
        { timeout: quickDomTimeout },
      );
      if (!extendButton.click) {
        throw new TimeoutError("Extend button cannot be clicked");
      }
      await extendButton.click();
      return true;
    },
    {
      paginationFollowUpTimeout,
      paginationInitialTimeout,
    },
  );
  if (!success) {
    return false;
  }

  try {
    await controller.webClick(
      By.CSS_SELECTOR,
      'button[aria-label="Schließen"]',
      quickDomTimeout,
    );
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }
  return true;
}
