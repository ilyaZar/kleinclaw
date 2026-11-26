/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { AdUpdateStrategy } from "../model/ad-model.js";
import { isRecord } from "../value-guards.js";
import { By, Is, TimeoutError } from "../web-primitives.js";
import {
  callPageScript,
  FORM_VALIDATION_ERRORS_SCRIPT,
  IDLESS_SUCCESS_PAGE_SCRIPT,
} from "../web/page-scripts.js";
import {
  CAPTCHA_IFRAME_SELECTOR,
  CONFIRMATION_URL_FRAGMENT,
  IMPRINT_GUIDANCE_SUBMIT_ID,
  NO_IMAGE_HINT_BUTTON_XPATH,
  PAYMENT_FORM_ID,
  SUBMIT_BUTTON_XPATH,
  TRACKING_SCRIPT_TEXT_JS,
  VISIBILITY_UPSELL_SKIP_BUTTON_XPATH,
} from "./publish-form-constants.js";
import {
  AdFormValidationError,
  CaptchaEncountered,
  PublishSubmissionUncertainError,
} from "./publish-form-errors.js";
import {
  clickElement,
} from "./publish-form-element-helpers.js";
import {
  type CaptchaOptions,
  type PublishingFormController,
  type PublishingImagesAd,
  type SubmitAdOptions,
} from "./publish-form-types.js";

export async function checkAndWaitForCaptcha(
  controller: Pick<PublishingFormController, "webProbe">,
  {
    autoRestart = false,
    captchaDetectionTimeout,
    isLoginPage = true,
    onManualCaptcha,
    restartDelaySeconds = null,
    scrollPageDown,
  }: CaptchaOptions = {},
): Promise<boolean> {
  const captchaElement = await controller.webProbe(
    By.CSS_SELECTOR,
    CAPTCHA_IFRAME_SELECTOR,
    { timeout: captchaDetectionTimeout },
  );
  if (captchaElement === null) {
    return false;
  }

  if (!isLoginPage && autoRestart) {
    throw new CaptchaEncountered(restartDelaySeconds);
  }

  if (!isLoginPage && scrollPageDown) {
    await scrollPageDown();
  }
  if (onManualCaptcha) {
    await onManualCaptcha();
  }
  return true;
}

export function parseConfirmationAdId(url: string): number | null {
  if (!url.includes(CONFIRMATION_URL_FRAGMENT)) {
    return null;
  }
  const parsed = new URL(url, "https://www.kleinanzeigen.de");
  const adId = parsed.searchParams.get("adId");
  if (!adId || !/^\d+$/.test(adId)) {
    return null;
  }
  const numericAdId = Number.parseInt(adId, 10);
  return Number.isFinite(numericAdId) ? numericAdId : null;
}

export async function recoverAdIdFromRedirect(
  controller: Pick<PublishingFormController, "webExecute">,
): Promise<number | null> {
  let referrer = "";
  try {
    referrer = String(await controller.webExecute("document.referrer") ?? "");
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }

  const referrerAdId = parseConfirmationAdId(referrer);
  if (referrerAdId !== null) {
    return referrerAdId;
  }

  try {
    const scriptContent = String(
      await controller.webExecute(TRACKING_SCRIPT_TEXT_JS) ?? "",
    );
    const match = /p-anzeige-aufgeben-bestaetigung\.html\?adId=(\d+)/
      .exec(scriptContent);
    return match ? Number.parseInt(match[1]!, 10) : null;
  } catch (error) {
    if (error instanceof TimeoutError) {
      return null;
    }
    throw error;
  }
}

async function waitForCondition(
  controller: Pick<PublishingFormController, "webSleep">,
  condition: () => Promise<boolean>,
  timeout = 30,
): Promise<void> {
  const deadline = Date.now() + timeout * 1000;
  do {
    if (await condition()) {
      return;
    }
    await controller.webSleep(500, 800);
  } while (Date.now() < deadline);
  throw new TimeoutError("Condition not met");
}

async function formValidationErrors(
  controller: Pick<PublishingFormController, "webExecute">,
): Promise<string[]> {
  try {
    const errors = await controller.webExecute(callPageScript(FORM_VALIDATION_ERRORS_SCRIPT));
    return Array.isArray(errors) ? errors.map(String) : [];
  } catch (error) {
    if (error instanceof TimeoutError) {
      return [];
    }
    throw error;
  }
}

async function isIdlessPublishSuccess(
  controller: Pick<PublishingFormController, "webExecute">,
): Promise<boolean> {
  try {
    return await controller.webExecute(callPageScript(IDLESS_SUCCESS_PAGE_SCRIPT)) === true;
  } catch {
    return false;
  }
}

// The update success marker only counts when the referrer is the edit page
// of the submitted ad.
export async function isUpdateSuccessPage(
  controller: Pick<PublishingFormController, "webExecute">,
  rootUrl: string,
  adId: number | null,
): Promise<boolean> {
  if (adId === null) {
    return false;
  }
  let snapshot: unknown;
  try {
    snapshot = await controller.webExecute(
      "({pageType: window.pageType, referrer: document.referrer})",
    );
  } catch {
    return false;
  }
  if (!isRecord(snapshot) || snapshot.pageType !== "EditAdSuccess" ||
    typeof snapshot.referrer !== "string") {
    return false;
  }
  try {
    const referrer = new URL(snapshot.referrer);
    const root = new URL(rootUrl);
    const ids = referrer.searchParams.getAll("adId");
    return referrer.origin === root.origin &&
      referrer.pathname === "/p-anzeige-bearbeiten.html" &&
      ids.length === 1 &&
      /^\d+$/.test(ids[0]!) &&
      Number(ids[0]) === adId;
  } catch {
    return false;
  }
}

async function handlePostSubmitPrompts(
  controller: Pick<PublishingFormController, "webProbe">,
  ad: Pick<PublishingImagesAd, "images">,
  {
    onPaymentForm,
    quickDomTimeout,
  }: Pick<SubmitAdOptions, "onPaymentForm" | "quickDomTimeout"> = {},
): Promise<void> {
  const imprintButton = await controller.webProbe(
    By.ID,
    IMPRINT_GUIDANCE_SUBMIT_ID,
    { timeout: quickDomTimeout },
  );
  if (imprintButton !== null) {
    await clickElement(imprintButton, "Unable to submit imprint guidance");
  }

  if (ad.images.length === 0) {
    const imageHintButton = await controller.webProbe(
      By.XPATH,
      NO_IMAGE_HINT_BUTTON_XPATH,
      { timeout: quickDomTimeout },
    );
    if (imageHintButton !== null) {
      await clickElement(
        imageHintButton,
        "Unable to confirm publish without image",
      );
    }
  }

  const visibilityUpsellSkipButton = await controller.webProbe(
    By.XPATH,
    VISIBILITY_UPSELL_SKIP_BUTTON_XPATH,
    { timeout: quickDomTimeout },
  );
  if (visibilityUpsellSkipButton !== null) {
    await clickElement(
      visibilityUpsellSkipButton,
      "Unable to continue without paid visibility upsell",
    );
  }

  const paymentForm = await controller.webProbe(
    By.ID,
    PAYMENT_FORM_ID,
    { timeout: quickDomTimeout },
  );
  if (paymentForm !== null && onPaymentForm) {
    await onPaymentForm();
  }
}

export async function submitAdForm(
  controller: Pick<
    PublishingFormController,
    "webClick" | "webExecute" | "webProbe" | "webSleep"
  >,
  ad: Pick<PublishingImagesAd, "images">,
  options: SubmitAdOptions = {},
): Promise<number> {
  const {
    configuredAdId = null,
    confirmationTimeout = 30,
    mode = AdUpdateStrategy.Replace,
    recoverIdlessAdId,
    rootUrl = "https://www.kleinanzeigen.de",
  } = options;
  await controller.webClick(By.XPATH, SUBMIT_BUTTON_XPATH);

  // After the click only an explicit form rejection proves a failure.
  const state = { adId: null as number | null, errors: [] as string[], idless: false };
  const idlessSuccess = async () =>
    (mode === AdUpdateStrategy.Modify &&
      await isUpdateSuccessPage(controller, rootUrl, configuredAdId)) ||
    await isIdlessPublishSuccess(controller);

  try {
    state.errors = await formValidationErrors(controller);
    if (state.errors.length === 0) {
      await handlePostSubmitPrompts(controller, ad, options);
      const settled = async () => {
        const url = String(await controller.webExecute("window.location.href"));
        state.adId = parseConfirmationAdId(url);
        if (state.adId !== null) {
          return true;
        }
        if (await idlessSuccess()) {
          state.idless = true;
          return true;
        }
        state.errors = await formValidationErrors(controller);
        return state.errors.length > 0;
      };
      if (options.waitForConfirmation) {
        await options.waitForConfirmation(settled, { timeout: confirmationTimeout });
      } else {
        await waitForCondition(controller, settled, confirmationTimeout);
      }
    }
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
    let recovered: number | null = null;
    try {
      recovered = mode === AdUpdateStrategy.Modify && await idlessSuccess()
        ? configuredAdId
        : options.recoverAdId
          ? await options.recoverAdId()
          : await recoverAdIdFromRedirect(controller);
    } catch {
      recovered = null;
    }
    if (recovered === null) {
      throw new PublishSubmissionUncertainError();
    }
    return recovered;
  }

  if (state.errors.length > 0) {
    throw new AdFormValidationError(state.errors);
  }
  if (state.adId !== null) {
    return state.adId;
  }
  if (mode === AdUpdateStrategy.Modify) {
    if (configuredAdId === null) {
      throw new PublishSubmissionUncertainError(
        "update succeeded but the configured ad ID is missing",
      );
    }
    return configuredAdId;
  }
  const recovered = recoverIdlessAdId
    ? await recoverIdlessAdId().catch(() => null)
    : null;
  if (recovered === null) {
    throw new PublishSubmissionUncertainError(
      "publish succeeded but no ad ID could be recovered",
    );
  }
  return recovered;
}

export async function checkPublishingResult(
  controller: Pick<PublishingFormController, "webCheck">,
): Promise<boolean> {
  const isDisplayed = async (id: string): Promise<boolean> => {
    try {
      return await controller.webCheck(By.ID, id, Is.DISPLAYED);
    } catch (error) {
      if (error instanceof TimeoutError) {
        return false;
      }
      throw error;
    }
  };

  return await isDisplayed("checking-done") ||
    await isDisplayed("not-completed");
}
