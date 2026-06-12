import { type WebElement } from "../web-primitives.js";
import { type SpecialAttributeElementInfo } from "./element-helpers.js";
import { type PublishingFormController, type PublishingFormOptions, type SetSpecialAttributesOptions } from "./types.js";
export declare function normalizeSpecialAttributeKey(key: string): string;
export declare function conditionCandidateValues(conditionValue: string): string[];
export declare function specialAttributeXPath(key: string): string;
export declare function specialAttributeCandidatePriority(info: Pick<SpecialAttributeElementInfo, "localName" | "role" | "type">): [number, number];
export declare function pickSpecialAttributeCandidate(candidates: WebElement[], specialAttributeKey: string): Promise<{
    element: WebElement;
    info: SpecialAttributeElementInfo;
}>;
export declare function setConditionDialog(controller: Pick<PublishingFormController, "webClick" | "webFind" | "webProbe">, conditionValue: string, { quickDomTimeout }?: PublishingFormOptions): Promise<boolean>;
export declare function setSpecialAttributes(controller: Pick<PublishingFormController, "webClick" | "webFind" | "webFindAll" | "webInput" | "webProbe" | "webSelect" | "webSelectButtonCombobox" | "webSelectCombobox">, specialAttributes: Record<string, unknown> | null | undefined, { setCondition }?: SetSpecialAttributesOptions): Promise<void>;
