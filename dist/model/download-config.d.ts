export interface DownloadConfigInput {
    dir?: string;
    includeAllMatchingShippingOptions?: boolean;
    include_all_matching_shipping_options?: boolean;
    excludedShippingOptions?: string[];
    excluded_shipping_options?: string[];
    folderNameMaxLength?: number;
    folder_name_max_length?: number;
    folderNameTemplate?: string;
    folder_name_template?: string;
    adFileNameTemplate?: string;
    ad_file_name_template?: string;
}
export declare class DownloadConfig {
    readonly dir: string;
    readonly includeAllMatchingShippingOptions: boolean;
    readonly excludedShippingOptions: string[];
    readonly folderNameMaxLength: number;
    readonly folderNameTemplate: string;
    readonly adFileNameTemplate: string;
    constructor(input?: DownloadConfigInput);
}
