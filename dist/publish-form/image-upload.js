/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { By, TimeoutError } from "../web-primitives.js";
import { IMAGE_FILE_INPUT_SELECTOR, IMAGE_MARKER_SELECTOR, IMAGE_REMOVE_BUTTON_SELECTOR, } from "./constants.js";
import { clickElement, elementAttribute } from "./element-helpers.js";
export async function imageMarkerValue(marker) {
    const value = await elementAttribute(marker, "value");
    return String(value ?? "").trim();
}
async function countImageMarkers(controller, quickDomTimeout) {
    const markers = await controller.webFindAll(By.CSS_SELECTOR, IMAGE_MARKER_SELECTOR, { timeout: quickDomTimeout });
    let count = 0;
    for (const marker of markers) {
        if (await imageMarkerValue(marker)) {
            count += 1;
        }
    }
    return count;
}
async function uploadFileToInput(fileInput, image) {
    if (fileInput.sendFile) {
        await fileInput.sendFile(image);
        return;
    }
    if (fileInput.setInputFiles) {
        await fileInput.setInputFiles(image);
        return;
    }
    throw new TimeoutError("File input does not support image upload");
}
async function pollImageUploadCondition(controller, condition, imageUploadTimeout = 30) {
    const deadline = Date.now() + imageUploadTimeout * 1000;
    do {
        if (await condition()) {
            return;
        }
        await controller.webSleep(500, 800);
    } while (Date.now() < deadline);
    throw new TimeoutError("Image upload timeout exceeded");
}
export async function uploadImages(controller, ad, { imageUploadTimeout = 30, quickDomTimeout, waitForImageUpload, } = {}) {
    if (ad.images.length === 0) {
        return;
    }
    let baselineMarkerCount = 0;
    try {
        baselineMarkerCount = await countImageMarkers(controller, quickDomTimeout);
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
    for (const image of ad.images) {
        const fileInput = await controller.webFind(By.CSS_SELECTOR, IMAGE_FILE_INPUT_SELECTOR);
        await uploadFileToInput(fileInput, image);
        await controller.webSleep();
    }
    const expectedCount = ad.images.length;
    const countProcessedImages = async () => {
        try {
            const markerCount = await countImageMarkers(controller, quickDomTimeout);
            return Math.max(0, markerCount - baselineMarkerCount);
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                return 0;
            }
            throw error;
        }
    };
    const checkImagesUploaded = async () => (await countProcessedImages()) >= expectedCount;
    try {
        if (waitForImageUpload) {
            await waitForImageUpload(checkImagesUploaded, {
                timeout: imageUploadTimeout,
                timeoutErrorMessage: "Image upload timeout exceeded",
            });
        }
        else {
            await pollImageUploadCondition(controller, checkImagesUploaded, imageUploadTimeout);
        }
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
        const currentCount = await countProcessedImages();
        throw new TimeoutError("Not all images were uploaded within timeout. " +
            `Expected ${expectedCount}, found ${currentCount} processed images.`);
    }
}
export async function cleanupExistingImages(controller, { quickDomTimeout } = {}) {
    let existingImageCount = 0;
    try {
        existingImageCount = await countImageMarkers(controller, quickDomTimeout);
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
    let removedCount = 0;
    for (let index = 0; index < existingImageCount; index += 1) {
        const removeButton = await controller.webProbe(By.CSS_SELECTOR, IMAGE_REMOVE_BUTTON_SELECTOR, { timeout: quickDomTimeout });
        if (removeButton === null) {
            throw new TimeoutError("Image cleanup failed before upload. " +
                `Removed ${index} of ${existingImageCount} existing images.`);
        }
        await clickElement(removeButton, "Image cleanup remove button cannot be clicked");
        removedCount += 1;
        await controller.webSleep(300, 500);
    }
    if (removedCount > 0) {
        await controller.webSleep(200, 350);
    }
    return removedCount;
}
