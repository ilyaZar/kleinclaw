import { ControllerElementInteraction } from "./controller-element-interaction.js";
import { By } from "./selector.js";
import { type WebElement, type WebLocator } from "./types.js";
export declare class ControllerSelectionControls extends ControllerElementInteraction {
    webSelect(type: By, value: string, selectedValue: unknown, timeout?: number): Promise<WebLocator>;
    webSelectCombobox(type: By, value: string, selectedValue: string | number, timeout?: number): Promise<WebElement>;
    webSelectButtonCombobox(elementId: string, selectedValue: string, timeout?: number): Promise<void>;
    private selectOption;
    private clickMatchingComboboxOption;
    private confirmComboboxFallback;
    private currentInputValue;
}
