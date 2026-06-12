/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { ValidationError } from "./validation-error.js";

export type PublishingDeleteOldAdsPolicy =
  | "BEFORE_PUBLISH"
  | "AFTER_PUBLISH"
  | "NEVER";

export interface PublishingConfigInput {
  deleteOldAds?: PublishingDeleteOldAdsPolicy | string | null;
  delete_old_ads?: PublishingDeleteOldAdsPolicy | string | null;
  deleteOldAdsByTitle?: boolean;
  delete_old_ads_by_title?: boolean;
}

export class PublishingConfig {
  readonly deleteOldAds: PublishingDeleteOldAdsPolicy;
  readonly deleteOldAdsByTitle: boolean;

  constructor(input: PublishingConfigInput = {}) {
    const deleteOldAds =
      input.deleteOldAds ?? input.delete_old_ads ?? "AFTER_PUBLISH";
    if (
      deleteOldAds !== "BEFORE_PUBLISH" &&
      deleteOldAds !== "AFTER_PUBLISH" &&
      deleteOldAds !== "NEVER"
    ) {
      throw new ValidationError(
        "publishing.delete_old_ads must be BEFORE_PUBLISH, AFTER_PUBLISH, or NEVER",
      );
    }
    this.deleteOldAds = deleteOldAds;
    this.deleteOldAdsByTitle =
      input.deleteOldAdsByTitle ?? input.delete_old_ads_by_title ?? true;
  }
}

export type AfterDeletePolicy = "NONE" | "RESET" | "DISABLE";

export interface DeletingConfigInput {
  afterDelete?: AfterDeletePolicy | string | null;
  after_delete?: AfterDeletePolicy | string | null;
}

export class DeletingConfig {
  readonly afterDelete: AfterDeletePolicy;

  constructor(input: DeletingConfigInput = {}) {
    const afterDelete = input.afterDelete ?? input.after_delete ?? "NONE";
    if (
      afterDelete !== "NONE" &&
      afterDelete !== "RESET" &&
      afterDelete !== "DISABLE"
    ) {
      throw new ValidationError(
        "deleting.after_delete must be NONE, RESET, or DISABLE",
      );
    }
    this.afterDelete = afterDelete;
  }
}
