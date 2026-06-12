export type PublishedAd = Record<string, unknown> & {
    id: unknown;
    state: unknown;
};
export type PublishedAdsWebRequest = (url: string) => Promise<unknown>;
export interface FetchPublishedAdsOptions {
    rootUrl?: string;
    strict?: boolean;
    maxPageLimit?: number;
}
export declare class PublishedAdsFetchIncompleteError extends Error {
    constructor(message: string);
}
export declare function coercePageNumber(value: unknown): number | null;
export declare function publishedAdsPageUrl(rootUrl: string, page: number): string;
export declare function fetchPublishedAds(webRequest: PublishedAdsWebRequest, { rootUrl, strict, maxPageLimit, }?: FetchPublishedAdsOptions): Promise<PublishedAd[]>;
