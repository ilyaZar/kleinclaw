import { type IslandProps } from "./download-extractor-island.js";
import { type WebReadController } from "./download-extractor-controller.js";
type ClassificationController = Pick<WebReadController, "webFind" | "webFindAll" | "webText">;
export declare function extractCategoryFromAdPage(controller: ClassificationController): Promise<string>;
export declare function parseAdAttributes(raw: string): Record<string, string>;
export declare function extractSpecialAttributesFromAdPage(controller: ClassificationController, dimensions: Record<string, unknown>, islandProps?: IslandProps): Promise<Record<string, string>>;
export declare function extractSpecialAttributesFromDom(controller: ClassificationController): Promise<Record<string, string>>;
export {};
