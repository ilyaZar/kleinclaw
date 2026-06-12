/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import fs from "node:fs/promises";
import path from "node:path";
import { elementAttribute } from "./browser-elements.js";
import { By, TimeoutError, } from "../web-primitives.js";
function contentTypeExtension(contentType) {
    const normalized = (contentType ?? "").split(";", 1)[0]?.trim().toLowerCase();
    switch (normalized) {
        case "image/jpeg":
            return ".jpg";
        case "image/png":
            return ".png";
        case "image/gif":
            return ".gif";
        case "image/webp":
            return ".webp";
        case "image/avif":
            return ".avif";
        default:
            return "";
    }
}
export async function downloadAndSaveImage(url, directory, filenamePrefix, imageNumber) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        const fileEnding = contentTypeExtension(response.headers.get("content-type"));
        const imagePath = path.join(directory, `${filenamePrefix}${imageNumber}${fileEnding}`);
        await fs.writeFile(imagePath, Buffer.from(await response.arrayBuffer()));
        return imagePath;
    }
    catch {
        return null;
    }
}
export async function downloadImagesFromAdPage(controller, downloadImage, directory, adFileStem) {
    const imagePaths = [];
    try {
        const imageBox = await controller.webFind(By.CLASS_NAME, "galleryimage-large");
        const images = await controller.webFindAll(By.CSS_SELECTOR, ".galleryimage-element[data-ix] > img", { parent: imageBox });
        const imageFilenamePrefix = `${adFileStem}__img`;
        let imageNumber = 1;
        for (const imageElement of images) {
            const currentImageUrl = await elementAttribute(imageElement, "src");
            if (currentImageUrl === null) {
                continue;
            }
            const imagePath = await downloadImage(currentImageUrl, directory, imageFilenamePrefix, imageNumber);
            if (imagePath) {
                imagePaths.push(path.basename(imagePath));
            }
            imageNumber += 1;
        }
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
    return imagePaths;
}
