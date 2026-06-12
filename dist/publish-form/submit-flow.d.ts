import { type CaptchaOptions, type PublishingFormController, type PublishingImagesAd, type SubmitAdOptions } from "./types.js";
export declare function checkAndWaitForCaptcha(controller: Pick<PublishingFormController, "webProbe">, { autoRestart, captchaDetectionTimeout, isLoginPage, onManualCaptcha, restartDelaySeconds, scrollPageDown, }?: CaptchaOptions): Promise<boolean>;
export declare function parseConfirmationAdId(url: string): number | null;
export declare function recoverAdIdFromRedirect(controller: Pick<PublishingFormController, "webExecute">): Promise<number | null>;
export declare function submitAdForm(controller: Pick<PublishingFormController, "webClick" | "webExecute" | "webProbe" | "webSleep">, ad: Pick<PublishingImagesAd, "images">, options?: SubmitAdOptions): Promise<number>;
export declare function checkPublishingResult(controller: Pick<PublishingFormController, "webCheck">): Promise<boolean>;
