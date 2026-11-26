export type IslandProps = Record<string, unknown>;
export declare function unwrapIsland(value: unknown): unknown;
export declare function parseIslandProps(raw: unknown): IslandProps;
export declare function readIslandProps(controller: {
    webExecute(js: string): Promise<unknown>;
}): Promise<IslandProps>;
export declare function islandImageUrls(props: IslandProps): string[];
export declare function islandPricing(props: IslandProps): [number | null, string] | null;
export declare function islandShippingText(props: IslandProps): string | null;
export declare function islandContactName(props: IslandProps): string | null;
export declare function islandCreationDate(props: IslandProps): string | null;
export declare function islandSpecialAttributes(props: IslandProps): Record<string, string>;
