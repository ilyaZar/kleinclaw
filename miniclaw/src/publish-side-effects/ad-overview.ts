/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { By, TimeoutError, type WebElement, type WebLocator } from "../web-primitives.js";
import { elementAttribute } from "./browser-elements.js";

interface AdOverviewController {
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
  webScrollPageDown?(): Promise<void>;
  webSleep(minMs?: number, maxMs?: number): Promise<void>;
}

async function isEnabledNextButton(button: WebElement): Promise<boolean> {
  const disabled = button.getAttribute
    ? await button.getAttribute("disabled")
    : null;
  const ariaDisabled = button.getAttribute
    ? await button.getAttribute("aria-disabled")
    : null;
  return disabled === null && String(ariaDisabled ?? "").toLowerCase() !== "true";
}

export async function navigatePaginatedAdOverview(
  controller: AdOverviewController,
  pageUrl: string,
  pageAction: (pageNumber: number) => Promise<boolean>,
  {
    maxPages = 10,
    paginationFollowUpTimeout,
    paginationInitialTimeout,
  }: {
    maxPages?: number;
    paginationFollowUpTimeout?: number;
    paginationInitialTimeout?: number;
  } = {},
): Promise<boolean> {
  try {
    await controller.webOpen(pageUrl);
  } catch (error) {
    if (error instanceof TimeoutError) {
      return false;
    }
    throw error;
  }

  await controller.webSleep(2000, 3000);
  try {
    await controller.webFind(By.ID, "my-manageitems-adlist");
  } catch (error) {
    if (error instanceof TimeoutError) {
      return false;
    }
    throw error;
  }

  const nextPageSelector = 'button[aria-label="Nächste"]';
  let multiPage = false;
  try {
    const nextButtons = await controller.webFindAll(
      By.CSS_SELECTOR,
      nextPageSelector,
      { timeout: paginationInitialTimeout },
    );
    multiPage = (await Promise.all(nextButtons.map(isEnabledNextButton)))
      .some(Boolean);
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }

  let currentPage = 1;
  while (currentPage <= maxPages) {
    try {
      await controller.webScrollPageDown?.();
    } catch (error) {
      if (!(error instanceof TimeoutError)) {
        throw error;
      }
    }
    await controller.webSleep(2000, 3000);
    try {
      if (await pageAction(currentPage)) {
        return true;
      }
    } catch (error) {
      if (error instanceof TimeoutError) {
        return false;
      }
      throw error;
    }

    if (!multiPage) {
      break;
    }

    try {
      const nextButtons = await controller.webFindAll(
        By.CSS_SELECTOR,
        nextPageSelector,
        { timeout: paginationFollowUpTimeout },
      );
      let nextButton: typeof nextButtons[number] | null = null;
      for (const button of nextButtons) {
        if (await isEnabledNextButton(button)) {
          nextButton = button;
          break;
        }
      }
      if (!nextButton?.click) {
        break;
      }
      await nextButton.click();
      await controller.webSleep(3000, 4000);
      currentPage += 1;
    } catch (error) {
      if (error instanceof TimeoutError) {
        break;
      }
      throw error;
    }
  }

  return false;
}

export async function extractOwnAdUrls(
  controller: AdOverviewController,
  rootUrl: string,
  {
    paginationFollowUpTimeout,
    paginationInitialTimeout,
  }: {
    paginationFollowUpTimeout?: number;
    paginationInitialTimeout?: number;
  } = {},
): Promise<string[]> {
  const refs: string[] = [];

  await navigatePaginatedAdOverview(
    controller,
    `${rootUrl}/m-meine-anzeigen.html`,
    async () => {
      try {
        const adListContainer = await controller.webFind(
          By.ID,
          "my-manageitems-adlist",
        );
        const listItems = await controller.webFindAll(
          By.CLASS_NAME,
          "cardbox",
          { parent: adListContainer },
        );

        const pageRefs: string[] = [];
        for (const listItem of listItems) {
          try {
            const link = await controller.webFind(
              By.CSS_SELECTOR,
              "div h3 a.text-onSurface",
              { parent: listItem as WebLocator },
            );
            const href = await elementAttribute(link, "href");
            if (href) {
              pageRefs.push(href);
            }
          } catch (error) {
            if (!(error instanceof TimeoutError)) {
              throw error;
            }
          }
        }

        const uniquePageRefs = [...new Set(pageRefs)];
        const newPageRefs = uniquePageRefs.filter((ref) => !refs.includes(ref));
        if (pageRefs.length > 0 && newPageRefs.length === 0) {
          return true;
        }
        refs.push(...newPageRefs);
        return false;
      } catch (error) {
        if (error instanceof TimeoutError) {
          return true;
        }
        return false;
      }
    },
    {
      paginationFollowUpTimeout,
      paginationInitialTimeout,
    },
  );

  return refs;
}
