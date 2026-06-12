import { type DownloadExtractorController } from "../download-extractor.js";
import { type DownloadAdContext, type NavigateToAdPageHook } from "../download-orchestration.js";
import { type Config } from "../model/config-model.js";
import { By, type WebLocator } from "../web-primitives.js";
interface DownloadBrowserController extends DownloadExtractorController {
    webClick(type: By, value: string, timeout?: number): Promise<WebLocator>;
    webOpen(url: string, options?: {
        timeout?: number;
        reloadIfAlreadyOpen?: boolean;
    }): Promise<void>;
    webSleep(minMs?: number, maxMs?: number): Promise<void>;
}
export declare function navigateToDownloadedAdPage(controller: DownloadBrowserController, rootUrl: string, context: Parameters<NavigateToAdPageHook>[0]): Promise<boolean>;
export declare function downloadAdWithBrowser(config: Config, controller: DownloadExtractorController, context: DownloadAdContext): Promise<void>;
export {};
