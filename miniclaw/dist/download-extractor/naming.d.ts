import { type Config } from "../model/config-model.js";
export declare function sanitizeFolderName(name: string, maxLength?: number): string;
export declare function renderDownloadNameWithBudget(template: string, adId: number, title: string, maxLength: number): string;
export declare function renderDownloadAdFileStem(config: Config, adId: number, title: string): string;
export declare function renderDownloadFolderName(config: Config, adId: number, title: string): string;
