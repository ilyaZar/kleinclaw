import { type BrowserSession, type BrowserSessionDriver } from "./browser-session.js";
import { type LoginOptions } from "./auth.js";
import { type DownloadAdHook, type ExtractOwnAdsUrlsHook, type NavigateToAdPageHook } from "./download-orchestration.js";
import { type ExtendAdContext } from "./extend-orchestration.js";
import { type Ad } from "./model/ad-model.js";
import { type Config } from "./model/config-model.js";
import { type TimingRecorder } from "./timing-collector.js";
import { type PublishAdFormOptions, type PublishAdFormResult, type PublishingFormController } from "./publish-form.js";
import { type PublishedAd } from "./published-ads.js";
import { type CapturePublishError, type DeleteAdHook, type PublishAttemptContext } from "./publish-orchestration.js";
import { WebController, type By, type WebElement, type WebLocator, type WebResponse } from "./web-primitives.js";
export interface BrowserPublishController extends PublishingFormController {
    readonly page?: {
        url?: string;
    };
    webFind(type: By, value: string, options?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<WebLocator>;
    webFindAll(type: By, value: string, options?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<WebElement[]>;
    webText(type: By, value: string, options?: {
        parent?: WebLocator | null;
        timeout?: number;
    }): Promise<string>;
    webRequest(url: string, method?: string, validResponseCodes?: number | Iterable<number>, headers?: Record<string, string> | null): Promise<WebResponse>;
}
export type BrowserPublishFormOptions = Pick<PublishAdFormOptions, "autoRestart" | "captchaDetectionTimeout" | "confirmationTimeout" | "dismissConsentBanner" | "imageUploadTimeout" | "onManualCaptcha" | "onPaymentForm" | "quickDomTimeout" | "restartDelaySeconds" | "scrollPageDown" | "waitForConfirmation" | "waitForImageUpload">;
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
export interface CreateBrowserPublishUpdateSideEffectsOptions extends BrowserPublishFormOptions {
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
    saveAdConfig?: (adFile: string, adConfig: Record<string, unknown>) => Promise<void>;
    session?: BrowserSession;
    sessionTimeout?: number;
    strictPublishedAds?: boolean;
    timingCollector?: TimingRecorder & {
        flush?: () => string | null;
    };
    webControllerOptions?: ConstructorParameters<typeof WebController>[1];
    publishAdFormImpl?: (controller: PublishingFormController, ad: Ad, options: PublishAdFormOptions) => Promise<PublishAdFormResult>;
}
export declare function createBrowserPublishUpdateSideEffects(config: Config, { allowLiveBrowser, command, configPath, controller, diagnosticsDir, driver, loginBeforeCommands, loginOptions, logFilePath, now, publishingResultTimeout, paginationFollowUpTimeout, paginationInitialTimeout, rootUrl, saveAdConfig, session, sessionTimeout, strictPublishedAds, timingCollector, webControllerOptions, publishAdFormImpl, ...formOptions }?: CreateBrowserPublishUpdateSideEffectsOptions): Promise<BrowserPublishUpdateSideEffects>;
