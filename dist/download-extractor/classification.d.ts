import { type WebReadController } from "./controller.js";
type ClassificationController = Pick<WebReadController, "webFind" | "webFindAll" | "webText">;
export declare function extractCategoryFromAdPage(controller: ClassificationController): Promise<string>;
export declare function extractSpecialAttributesFromAdPage(controller: ClassificationController, belenConf: unknown): Promise<Record<string, string>>;
export declare function extractSpecialAttributesFromDom(controller: ClassificationController): Promise<Record<string, string>>;
export {};
