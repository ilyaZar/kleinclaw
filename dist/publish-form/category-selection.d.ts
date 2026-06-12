import { type PublishingFormController, type PublishingFormOptions, type SetCategoryOptions } from "./types.js";
export declare function resolveCategorySuggestions(controller: Pick<PublishingFormController, "webClick" | "webFindAll" | "webProbe" | "webSleep">, category: string, { quickDomTimeout }?: PublishingFormOptions): Promise<boolean>;
export declare function setCategory(controller: Pick<PublishingFormController, "webClick" | "webFind" | "webFindAll" | "webOpen" | "webProbe" | "webSleep">, { adFile, category, rootUrl, quickDomTimeout }: SetCategoryOptions): Promise<void>;
