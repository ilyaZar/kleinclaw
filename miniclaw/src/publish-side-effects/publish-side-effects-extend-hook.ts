/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type ExtendAdContext } from "../extend-orchestration.js";
import { By, TimeoutError, type WebElement, type WebLocator } from "../web-primitives.js";
import {
  callPageScript,
  EXTEND_CHOICE_DIALOG_SCRIPT,
} from "../web/page-scripts.js";
import {
  navigatePaginatedAdOverview,
} from "./publish-side-effects-ad-overview.js";

// The paid option ("Verlängern & Hochschieben für 2,99 €") must never be
// selected; the page script matches the free option by value or this label.
const FREE_OPTION_TEXT = "Nur verlängern";
const CONFIRM_BUTTON_TEXT = "Anzeige verlängern";
const SUCCESS_TEXT = "erfolgreich verlängert";
const CLASSIC_SUCCESS_TEXT = "Vielen Dank";

type DialogState = "choice" | "success" | "none";

interface ExtendPublishedAdController {
  webAwait<T>(
    condition: () => T | Promise<T>,
    options?: { timeout?: number | null; timeoutErrorMessage?: string },
  ): Promise<T>;
  webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
  webExecute(jscode: string): Promise<unknown>;
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

function choiceDialogScript(action: "state" | "select" | "confirm"): string {
  return callPageScript(
    EXTEND_CHOICE_DIALOG_SCRIPT,
    action,
    FREE_OPTION_TEXT,
    CONFIRM_BUTTON_TEXT,
    SUCCESS_TEXT,
    CLASSIC_SUCCESS_TEXT,
  );
}

async function awaitDialogState(
  controller: ExtendPublishedAdController,
  wanted: readonly DialogState[],
  timeout: number | undefined,
): Promise<DialogState | null> {
  try {
    return await controller.webAwait(async () => {
      const state = String(await controller.webExecute(choiceDialogScript("state")));
      return wanted.includes(state as DialogState) ? state as DialogState : null;
    }, {
      timeout,
      timeoutErrorMessage: `Extension dialog state did not become ${wanted.join("|")}`,
    });
  } catch (error) {
    if (error instanceof TimeoutError) {
      return null;
    }
    throw error;
  }
}

// Every step re-checks that exactly the free option is selected; a dialog
// that merely closes is not a success.
async function confirmFreeExtension(
  controller: ExtendPublishedAdController,
  confirmationTimeout: number | undefined,
): Promise<boolean> {
  if (String(await controller.webExecute(choiceDialogScript("select"))) !== "selected") {
    return false;
  }
  await controller.webSleep();
  if (String(await controller.webExecute(choiceDialogScript("confirm"))) !== "clicked") {
    return false;
  }
  return await awaitDialogState(controller, ["success"], confirmationTimeout) === "success";
}

async function closeOpenDialog(
  controller: ExtendPublishedAdController,
  quickDomTimeout: number | undefined,
): Promise<void> {
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
}

export async function extendPublishedAd(
  controller: ExtendPublishedAdController,
  rootUrl: string,
  context: ExtendAdContext,
  {
    confirmationTimeout,
    paginationFollowUpTimeout,
    paginationInitialTimeout,
    quickDomTimeout,
  }: {
    confirmationTimeout?: number;
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
  let clicked = false;
  await navigatePaginatedAdOverview(
    controller,
    `${rootUrl}/m-meine-anzeigen.html`,
    async () => {
      let extendButton: WebLocator;
      try {
        extendButton = await controller.webFind(
          By.XPATH,
          extendButtonXPath,
          { timeout: quickDomTimeout },
        );
      } catch (error) {
        if (error instanceof TimeoutError) {
          return false;
        }
        throw error;
      }
      if (!extendButton.click) {
        return false;
      }
      // A success toast from a previous extension would be taken for this one.
      if (!await awaitDialogState(controller, ["none"], confirmationTimeout)) {
        return true;
      }
      await extendButton.click();
      clicked = true;
      return true;
    },
    {
      paginationFollowUpTimeout,
      paginationInitialTimeout,
    },
  );
  if (!clicked) {
    return false;
  }

  // Since the Astro redesign "Verlängern" opens a choice dialog; the classic
  // flow extends directly and shows a "Vielen Dank!" dialog.
  const state = await awaitDialogState(
    controller,
    ["choice", "success"],
    confirmationTimeout,
  );
  const extended = state === "success" ||
    (state === "choice" &&
      await confirmFreeExtension(controller, confirmationTimeout));
  await closeOpenDialog(controller, quickDomTimeout);
  return extended;
}
