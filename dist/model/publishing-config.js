/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { ValidationError } from "./validation-error.js";
export class PublishingConfig {
    deleteOldAds;
    deleteOldAdsByTitle;
    constructor(input = {}) {
        const deleteOldAds = input.deleteOldAds ?? input.delete_old_ads ?? "AFTER_PUBLISH";
        if (deleteOldAds !== "BEFORE_PUBLISH" &&
            deleteOldAds !== "AFTER_PUBLISH" &&
            deleteOldAds !== "NEVER") {
            throw new ValidationError("publishing.delete_old_ads must be BEFORE_PUBLISH, AFTER_PUBLISH, or NEVER");
        }
        this.deleteOldAds = deleteOldAds;
        this.deleteOldAdsByTitle =
            input.deleteOldAdsByTitle ?? input.delete_old_ads_by_title ?? true;
    }
}
export class DeletingConfig {
    afterDelete;
    constructor(input = {}) {
        const afterDelete = input.afterDelete ?? input.after_delete ?? "NONE";
        if (afterDelete !== "NONE" &&
            afterDelete !== "RESET" &&
            afterDelete !== "DISABLE") {
            throw new ValidationError("deleting.after_delete must be NONE, RESET, or DISABLE");
        }
        this.afterDelete = afterDelete;
    }
}
