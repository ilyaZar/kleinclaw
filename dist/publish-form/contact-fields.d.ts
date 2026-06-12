import { type PublishingContact, type PublishingFormController, type PublishingFormOptions } from "./types.js";
export declare function locationMatchesTarget(target: string, candidate: string | null | undefined): boolean;
export declare function cityListboxOptionSelector(listboxId: string): string;
export declare function readCitySelectionText(controller: Pick<PublishingFormController, "webFind">, { quickDomTimeout }?: PublishingFormOptions): Promise<string | null>;
export declare function selectCityComboboxOption(controller: Pick<PublishingFormController, "webClick" | "webFind" | "webFindAll">, target: string, { quickDomTimeout }?: PublishingFormOptions): Promise<void>;
export declare function setContactLocation(controller: Pick<PublishingFormController, "webClick" | "webFind" | "webFindAll">, location: string | null | undefined, { quickDomTimeout }?: PublishingFormOptions): Promise<void>;
export declare function setContactFields(controller: Pick<PublishingFormController, "webCheck" | "webClick" | "webExecute" | "webFind" | "webFindAll" | "webInput" | "webProbe" | "webSleep">, contact: PublishingContact, { quickDomTimeout }?: PublishingFormOptions): Promise<void>;
