import { type PublishingFormController } from "./publish-form-types.js";
type DialogController = Pick<PublishingFormController, "webExecute" | "webSleep">;
export declare function categoryLabelTokens(label: string): string[];
export declare function categoryLabelMatchScore(label: string, candidate: string): number;
export declare function categoryDialogLabelOptions(category: string, categories: Readonly<Record<string, string>>, productTitle?: string | null): string[][];
export declare function siteCategoryLabels(controller: Pick<PublishingFormController, "webExecute">, category: string): Promise<Map<number, string>>;
export declare function categoryDialogOpen(controller: Pick<PublishingFormController, "webExecute">): Promise<boolean>;
export declare function setCategoryInDialog(controller: DialogController, category: string, categories: Readonly<Record<string, string>>, productTitle?: string | null): Promise<void>;
export {};
