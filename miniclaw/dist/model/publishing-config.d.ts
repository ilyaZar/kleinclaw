export type PublishingDeleteOldAdsPolicy = "BEFORE_PUBLISH" | "AFTER_PUBLISH" | "NEVER";
export interface PublishingConfigInput {
    deleteOldAds?: PublishingDeleteOldAdsPolicy | string | null;
    delete_old_ads?: PublishingDeleteOldAdsPolicy | string | null;
    deleteOldAdsByTitle?: boolean;
    delete_old_ads_by_title?: boolean;
}
export declare class PublishingConfig {
    readonly deleteOldAds: PublishingDeleteOldAdsPolicy;
    readonly deleteOldAdsByTitle: boolean;
    constructor(input?: PublishingConfigInput);
}
export type AfterDeletePolicy = "NONE" | "RESET" | "DISABLE";
export interface DeletingConfigInput {
    afterDelete?: AfterDeletePolicy | string | null;
    after_delete?: AfterDeletePolicy | string | null;
}
export declare class DeletingConfig {
    readonly afterDelete: AfterDeletePolicy;
    constructor(input?: DeletingConfigInput);
}
