/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import {
  createBrowserSession,
  type BrowserSession,
  type BrowserSessionDriver,
} from "./browser-session.js";
import {
  login as loginToKleinanzeigen,
  type LoginOptions,
} from "./auth.js";
import {
  type DownloadAdHook,
  type ExtractOwnAdsUrlsHook,
  type NavigateToAdPageHook,
} from "./download-orchestration.js";
import { type ExtendAdContext } from "./extend-orchestration.js";
import {
  AdUpdateStrategy,
  applyAutoPriceReduction,
  type Ad,
  type AdLike,
} from "./model/ad-model.js";
import { type Config } from "./model/config-model.js";
import { saveDataFile } from "./io.js";
import {
  type TimingRecorder,
} from "./timing-collector.js";
import {
  checkPublishingResult,
  publishAdForm,
  type PublishAdFormOptions,
  type PublishAdFormResult,
  type PublishingFormController,
} from "./publish-form.js";
import {
  fetchPublishedAds,
  type PublishedAd,
} from "./published-ads.js";
import {
  type CapturePublishError,
  type DeleteAdHook,
  type PublishAttemptContext,
} from "./publish-orchestration.js";
import {
  extractOwnAdUrls,
} from "./publish-side-effects/ad-overview.js";
import { deletePublishedAd } from "./publish-side-effects/delete-hook.js";
import {
  downloadAdWithBrowser,
  navigateToDownloadedAdPage,
} from "./publish-side-effects/download-hook.js";
import { extendPublishedAd } from "./publish-side-effects/extend-hook.js";
import {
  createLoginDiagnosticsCapture,
  createPublishDiagnosticsCapture,
  createTimingCollector,
} from "./publish-side-effects/factory-support.js";
import {
  TimeoutError,
  WebController,
  type By,
  type WebElement,
  type WebLocator,
  type WebPage,
  type WebResponse,
} from "./web-primitives.js";

export interface BrowserPublishController extends PublishingFormController {
  readonly page?: { url?: string };
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
  webText(
    type: By,
    value: string,
    options?: { parent?: WebLocator | null; timeout?: number },
  ): Promise<string>;
  webRequest(
    url: string,
    method?: string,
    validResponseCodes?: number | Iterable<number>,
    headers?: Record<string, string> | null,
  ): Promise<WebResponse>;
}

export type BrowserPublishFormOptions = Pick<
  PublishAdFormOptions,
  | "autoRestart"
  | "captchaDetectionTimeout"
  | "confirmationTimeout"
  | "dismissConsentBanner"
  | "imageUploadTimeout"
  | "onManualCaptcha"
  | "onPaymentForm"
  | "quickDomTimeout"
  | "restartDelaySeconds"
  | "scrollPageDown"
  | "waitForConfirmation"
  | "waitForImageUpload"
>;

export interface BrowserPublishUpdateSideEffects {
  captureError?: CapturePublishError;
  close(): Promise<void>;
  deleteAd: DeleteAdHook;
  downloadAd: DownloadAdHook;
  extendAd(context: ExtendAdContext): Promise<boolean>;
  extractOwnAdsUrls: ExtractOwnAdsUrlsHook;
  fetchPublishedAds(): Promise<PublishedAd[]>;
  navigateToAdPage: NavigateToAdPageHook;
  publishAd(context: PublishAttemptContext): Promise<void>;
  updateAd(context: PublishAttemptContext): Promise<void>;
  waitForPublishingResult(): Promise<void>;
}

export interface CreateBrowserPublishUpdateSideEffectsOptions
  extends BrowserPublishFormOptions {
  allowLiveBrowser?: boolean;
  command?: string;
  configPath?: string;
  controller?: BrowserPublishController;
  diagnosticsDir?: string;
  driver?: BrowserSessionDriver;
  loginBeforeCommands?: boolean;
  loginOptions?: Omit<LoginOptions, "rootUrl">;
  logFilePath?: string | null;
  now?: () => Date;
  publishingResultTimeout?: number;
  paginationInitialTimeout?: number;
  paginationFollowUpTimeout?: number;
  rootUrl?: string;
  saveAdConfig?: (
    adFile: string,
    adConfig: Record<string, unknown>,
  ) => Promise<void>;
  session?: BrowserSession;
  sessionTimeout?: number;
  strictPublishedAds?: boolean;
  timingCollector?: TimingRecorder & { flush?: () => string | null };
  webControllerOptions?: ConstructorParameters<typeof WebController>[1];
  publishAdFormImpl?: (
    controller: PublishingFormController,
    ad: Ad,
    options: PublishAdFormOptions,
  ) => Promise<PublishAdFormResult>;
}

async function waitForPublishingResult(
  controller: BrowserPublishController,
  timeout: number,
): Promise<void> {
  const deadline = Date.now() + timeout * 1000;
  do {
    if (await checkPublishingResult(controller)) {
      return;
    }
    await controller.webSleep(500, 800);
  } while (Date.now() < deadline);
  throw new TimeoutError("Publishing result was not confirmed");
}

async function runPublishForm(
  controller: BrowserPublishController,
  context: PublishAttemptContext,
  mode: AdUpdateStrategy,
  {
    formOptions,
    now,
    publishAdFormImpl,
    rootUrl,
    saveAdConfig,
  }: {
    formOptions: BrowserPublishFormOptions;
    now: () => Date;
    publishAdFormImpl: CreateBrowserPublishUpdateSideEffectsOptions["publishAdFormImpl"];
    rootUrl: string;
    saveAdConfig: CreateBrowserPublishUpdateSideEffectsOptions["saveAdConfig"];
  },
): Promise<void> {
  applyAutoPriceReduction(context.ad as unknown as AdLike, {
    mode,
    now: now(),
  });
  await (publishAdFormImpl ?? publishAdForm)(
    controller,
    context.ad,
    {
      ...formOptions,
      adConfig: context.raw as Record<string, unknown>,
      adFile: context.adFile,
      mode,
      now,
      rootUrl,
      saveAdConfig,
    },
  );
}

export async function createBrowserPublishUpdateSideEffects(
  config: Config,
  {
    allowLiveBrowser = false,
    command = "browser",
    configPath,
    controller,
    diagnosticsDir,
    driver,
    loginBeforeCommands = true,
    loginOptions,
    logFilePath,
    now = () => new Date(),
    publishingResultTimeout,
    paginationFollowUpTimeout,
    paginationInitialTimeout,
    rootUrl = "https://www.kleinanzeigen.de",
    saveAdConfig = saveDataFile,
    session,
    sessionTimeout,
    strictPublishedAds = false,
    timingCollector,
    webControllerOptions,
    publishAdFormImpl,
    ...formOptions
  }: CreateBrowserPublishUpdateSideEffectsOptions = {},
): Promise<BrowserPublishUpdateSideEffects> {
  const timeouts = config.timeouts;
  const resolvedFormOptions: BrowserPublishFormOptions = {
    ...formOptions,
    captchaDetectionTimeout:
      formOptions.captchaDetectionTimeout ??
      timeouts.resolve("captchaDetection"),
    confirmationTimeout:
      formOptions.confirmationTimeout ??
      timeouts.resolve("publishingConfirmation"),
    imageUploadTimeout:
      formOptions.imageUploadTimeout ?? timeouts.resolve("imageUpload"),
    quickDomTimeout:
      formOptions.quickDomTimeout ?? timeouts.resolve("quickDom"),
  };
  const resolvedPaginationFollowUpTimeout =
    paginationFollowUpTimeout ?? timeouts.resolve("paginationFollowUp");
  const resolvedPaginationInitialTimeout =
    paginationInitialTimeout ?? timeouts.resolve("paginationInitial");
  const resolvedPublishingResultTimeout =
    publishingResultTimeout ?? timeouts.resolve("publishingResult");
  const resolvedSessionTimeout =
    sessionTimeout ?? timeouts.resolve("chromeRemoteDebugging");
  const activeTimingCollector = timingCollector ?? createTimingCollector(
    config,
    {
      command,
      configPath,
      diagnosticsDir,
      now,
    },
  );
  const resolvedWebControllerOptions = {
    ...webControllerOptions,
    defaultTimeout:
      webControllerOptions?.defaultTimeout ?? timeouts.resolve("default"),
    timeoutConfig: webControllerOptions?.timeoutConfig ?? timeouts,
    timingCollector:
      webControllerOptions?.timingCollector ?? activeTimingCollector,
  };

  const activeSession = session ?? (
    controller
      ? null
      : await createBrowserSession(config, {
        allowLiveBrowser,
        driver,
        timeout: resolvedSessionTimeout,
      })
  );
  const activeController = controller ??
    new WebController(
      activeSession!.page as unknown as WebPage,
      resolvedWebControllerOptions,
    );
  const loginDiagnostics = createLoginDiagnosticsCapture(config, {
    configPath,
    controller: activeController,
    diagnosticsDir,
    logFilePath,
    now,
  });
  const publishDiagnostics = createPublishDiagnosticsCapture(config, {
    configPath,
    controller: activeController,
    diagnosticsDir,
    logFilePath,
    now,
  });

  try {
    if (loginBeforeCommands) {
      await loginToKleinanzeigen(activeController, config.login, {
        captchaDetectionTimeout: resolvedFormOptions.captchaDetectionTimeout,
        emailVerificationTimeout: timeouts.resolve("emailVerification"),
        loginDetectionTimeout: timeouts.resolve("loginDetection"),
        onManualCaptcha: resolvedFormOptions.onManualCaptcha,
        pageLoadTimeout: timeouts.resolve("pageLoad"),
        quickDomTimeout: resolvedFormOptions.quickDomTimeout,
        rootUrl,
        smsVerificationTimeout: timeouts.resolve("smsVerification"),
        ...loginOptions,
        captureDiagnostics: loginOptions?.captureDiagnostics ?? loginDiagnostics,
      });
    }
  } catch (error) {
    activeTimingCollector?.flush?.();
    if (activeSession) {
      try {
        await activeSession.close();
      } catch {
        // Preserve the login failure; cleanup is best-effort here.
      }
    }
    throw error;
  }

  return {
    captureError: publishDiagnostics,
    close: async () => {
      activeTimingCollector?.flush?.();
      if (activeSession) {
        await activeSession.close();
      }
    },
    deleteAd: (context) => deletePublishedAd(
      activeController,
      rootUrl,
      context,
    ),
    downloadAd: (context) => downloadAdWithBrowser(
      config,
      activeController,
      context,
    ),
    extendAd: (context) => extendPublishedAd(
      activeController,
      rootUrl,
      context,
      {
        paginationFollowUpTimeout: resolvedPaginationFollowUpTimeout,
        paginationInitialTimeout: resolvedPaginationInitialTimeout,
        quickDomTimeout: resolvedFormOptions.quickDomTimeout,
      },
    ),
    extractOwnAdsUrls: () => extractOwnAdUrls(
      activeController,
      rootUrl,
      {
        paginationFollowUpTimeout: resolvedPaginationFollowUpTimeout,
        paginationInitialTimeout: resolvedPaginationInitialTimeout,
      },
    ),
    fetchPublishedAds: () => fetchPublishedAds(
      (url) => activeController.webRequest(url),
      { rootUrl, strict: strictPublishedAds },
    ),
    navigateToAdPage: (context) => navigateToDownloadedAdPage(
      activeController,
      rootUrl,
      context,
    ),
    publishAd: (context) => runPublishForm(
      activeController,
      context,
      AdUpdateStrategy.Replace,
      {
        formOptions: resolvedFormOptions,
        now,
        publishAdFormImpl,
        rootUrl,
        saveAdConfig,
      },
    ),
    updateAd: (context) => runPublishForm(
      activeController,
      context,
      AdUpdateStrategy.Modify,
      {
        formOptions: resolvedFormOptions,
        now,
        publishAdFormImpl,
        rootUrl,
        saveAdConfig,
      },
    ),
    waitForPublishingResult: () => waitForPublishingResult(
      activeController,
      resolvedPublishingResultTimeout,
    ),
  };
}
