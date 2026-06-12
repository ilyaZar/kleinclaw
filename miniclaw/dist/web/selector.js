/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
const CSS_META_CHARS = new Set("!\"#$%&'()*+,./:;<=>?@[\\]^`{|}~".split(""));
export var By;
(function (By) {
    By["ID"] = "ID";
    By["CLASS_NAME"] = "CLASS_NAME";
    By["CSS_SELECTOR"] = "CSS_SELECTOR";
    By["TAG_NAME"] = "TAG_NAME";
    By["TEXT"] = "TEXT";
    By["XPATH"] = "XPATH";
})(By || (By = {}));
export function escapeCssMeta(value) {
    return [...value]
        .map((char) => CSS_META_CHARS.has(char) ? `\\${char}` : char)
        .join("");
}
export function selectorFor(type, value) {
    switch (type) {
        case By.ID:
            return `#${escapeCssMeta(value)}`;
        case By.CLASS_NAME:
            return `.${escapeCssMeta(value)}`;
        case By.CSS_SELECTOR:
        case By.TAG_NAME:
            return value;
        case By.TEXT:
            return `text=${value}`;
        case By.XPATH:
            return `xpath=${value}`;
    }
}
