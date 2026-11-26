/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { AdUpdateStrategy, } from "./model/ad-model.js";
import { By } from "./web-primitives.js";
import { setCategory, } from "./publish-form/publish-form-category-selection.js";
import { configurePriceFields, configureSellDirectly, selectWantedShipping, setDeferredTitleField, setDescriptionField, } from "./publish-form/publish-form-core-fields.js";
import { setContactFields, } from "./publish-form/publish-form-contact-fields.js";
import { cleanupExistingImages, uploadImages, } from "./publish-form/publish-form-image-upload.js";
import { updateAdConfigAfterPublish, } from "./publish-form/publish-form-metadata.js";
import { setSpecialAttributes, } from "./publish-form/publish-form-special-attributes.js";
import { setShipping, } from "./publish-form/publish-form-shipping-fields.js";
import { checkAndWaitForCaptcha, submitAdForm, } from "./publish-form/publish-form-submit-flow.js";
function publishFormUrl(rootUrl, ad, mode) {
    if (mode === AdUpdateStrategy.Modify) {
        return `${rootUrl}/p-anzeige-bearbeiten.html?adId=${ad.id}`;
    }
    return `${rootUrl}/p-anzeige-aufgeben-schritt2.html`;
}
export async function publishAdForm(controller, ad, { adConfig, adFile, autoRestart, captchaDetectionTimeout, confirmationTimeout, dismissConsentBanner, imageUploadTimeout, mode = AdUpdateStrategy.Replace, now = () => new Date(), onManualCaptcha, onPaymentForm, quickDomTimeout, recoverAdId, recoverIdlessAdId, restartDelaySeconds, rootUrl, saveAdConfig, scrollPageDown, waitForConfirmation, waitForImageUpload, }) {
    await controller.webOpen(publishFormUrl(rootUrl, ad, mode), { reloadIfAlreadyOpen: true });
    if (dismissConsentBanner) {
        await dismissConsentBanner();
    }
    if (ad.type === "WANTED") {
        await controller.webClick(By.ID, "ad-type-WANTED");
    }
    await setCategory(controller, {
        adFile,
        category: ad.category,
        productTitle: ad.title,
        quickDomTimeout,
    });
    await controller.webSleep();
    await setSpecialAttributes(controller, ad.specialAttributes);
    if (ad.shippingType !== "NOT_APPLICABLE") {
        if (ad.type === "WANTED") {
            await selectWantedShipping(controller, ad.shippingType, { quickDomTimeout });
        }
        else {
            await setShipping(controller, ad, { mode, quickDomTimeout });
        }
    }
    await configurePriceFields(controller, ad);
    await configureSellDirectly(controller, ad, { quickDomTimeout });
    await setDescriptionField(controller, ad);
    await setContactFields(controller, ad.contact, { quickDomTimeout });
    const removedImageCount = await cleanupExistingImages(controller, {
        quickDomTimeout,
    });
    await uploadImages(controller, ad, {
        imageUploadTimeout,
        quickDomTimeout,
        waitForImageUpload,
    });
    await checkAndWaitForCaptcha(controller, {
        autoRestart,
        captchaDetectionTimeout,
        isLoginPage: false,
        onManualCaptcha,
        restartDelaySeconds,
        scrollPageDown,
    });
    await setDeferredTitleField(controller, ad);
    const adId = await submitAdForm(controller, ad, {
        configuredAdId: ad.id,
        confirmationTimeout,
        mode,
        onPaymentForm,
        quickDomTimeout,
        recoverAdId,
        recoverIdlessAdId,
        rootUrl,
        waitForConfirmation,
    });
    if (adConfig) {
        updateAdConfigAfterPublish(adConfig, ad, adId, mode, now());
        if (saveAdConfig) {
            await saveAdConfig(adFile, adConfig);
        }
    }
    else if (saveAdConfig) {
        throw new Error("adConfig must be provided when saveAdConfig is configured");
    }
    return { adConfig, adId, removedImageCount };
}
