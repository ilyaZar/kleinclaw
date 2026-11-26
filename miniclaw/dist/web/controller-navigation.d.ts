import { ControllerSelectionControls } from "./controller-selection-controls.js";
import { type WebRequestOptions, type WebResponse } from "./types.js";
export declare class ControllerNavigation extends ControllerSelectionControls {
    webExecute(jscode: string): Promise<unknown>;
    webRequest(url: string, method?: string, validResponseCodes?: number | Iterable<number>, headers?: Record<string, string> | null, { timeout }?: WebRequestOptions): Promise<WebResponse>;
    webOpen(url: string, { timeout, reloadIfAlreadyOpen, }?: {
        timeout?: number;
        reloadIfAlreadyOpen?: boolean;
    }): Promise<void>;
    webScrollPageDown(scrollLength?: number, scrollSpeed?: number, { scrollBackTop, }?: {
        scrollBackTop?: boolean;
    }): Promise<void>;
}
