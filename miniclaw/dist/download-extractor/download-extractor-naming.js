/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
const MAX_FILENAME_COMPONENT_LENGTH = 255;
const DOWNLOAD_STEM_SUFFIX_BUDGET = "__img9999.jpeg".length;
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
function truncateAtWordBoundary(value, maxLength) {
    if (value.length <= maxLength) {
        return value;
    }
    const truncated = value.slice(0, maxLength);
    const lastBreak = Math.max(truncated.lastIndexOf(" "), truncated.lastIndexOf("_"));
    return lastBreak > Math.trunc(maxLength * 0.7)
        ? truncated.slice(0, lastBreak)
        : truncated;
}
export function sanitizeFolderName(name, maxLength = 100) {
    const raw = (name || "").trim();
    if (!raw) {
        return "untitled";
    }
    let safe = raw
        .replace(INVALID_FILENAME_CHARS, "")
        .replace(/\.+/g, ".")
        .replace(/^\.+/, "")
        .replace(/[.\s]+$/, "")
        .normalize("NFC");
    if (!safe || RESERVED_WINDOWS_NAMES.test(safe)) {
        safe = "untitled";
    }
    return truncateAtWordBoundary(safe, maxLength);
}
function parseTemplate(template) {
    const parts = [];
    const pattern = /\{([^{}]+)\}/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(template)) !== null) {
        parts.push({
            fieldName: match[1] ?? null,
            literalText: template.slice(cursor, match.index),
        });
        cursor = match.index + match[0].length;
    }
    parts.push({ fieldName: null, literalText: template.slice(cursor) });
    return parts;
}
function reservedForPendingPlaceholders(hasId, idRendered, idValue) {
    return hasId && !idRendered ? idValue.length : 0;
}
export function renderDownloadNameWithBudget(template, adId, title, maxLength) {
    const sanitizedTitle = sanitizeFolderName(title, maxLength);
    const parsedTemplate = parseTemplate(template);
    const idValue = String(adId);
    const hasId = parsedTemplate.some((part) => part.fieldName === "id");
    let idRendered = false;
    let currentLength = 0;
    const parts = [];
    for (let index = 0; index < parsedTemplate.length; index += 1) {
        const part = parsedTemplate[index];
        const remainingLength = maxLength - currentLength;
        const reservedForPriority = reservedForPendingPlaceholders(hasId, idRendered, idValue);
        const literalLength = Math.min(part.literalText.length, Math.max(0, remainingLength - reservedForPriority));
        parts.push(part.literalText.slice(0, literalLength));
        currentLength += literalLength;
        if (part.fieldName === null) {
            continue;
        }
        const remainingAfterLiteral = maxLength - currentLength;
        if (part.fieldName === "id") {
            const idPart = idValue.slice(0, remainingAfterLiteral);
            parts.push(idPart);
            currentLength += idPart.length;
            idRendered = true;
            continue;
        }
        if (part.fieldName === "title") {
            const reservedForId = hasId && !idRendered ? idValue.length : 0;
            const futureLiterals = parsedTemplate
                .slice(index + 1)
                .reduce((total, future) => total + future.literalText.length, 0);
            const availableForTitle = Math.max(0, remainingAfterLiteral - reservedForId - futureLiterals);
            const titlePart = sanitizedTitle.slice(0, availableForTitle);
            parts.push(titlePart);
            currentLength += titlePart.length;
        }
    }
    return sanitizeFolderName(parts.join("").trim(), maxLength);
}
export function renderDownloadAdFileStem(config, adId, title) {
    return renderDownloadNameWithBudget(config.download.adFileNameTemplate, adId, title, MAX_FILENAME_COMPONENT_LENGTH - DOWNLOAD_STEM_SUFFIX_BUDGET);
}
export function renderDownloadFolderName(config, adId, title) {
    return renderDownloadNameWithBudget(config.download.folderNameTemplate, adId, title, config.download.folderNameMaxLength);
}
