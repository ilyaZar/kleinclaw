import { type Config } from "./model/config-model.js";
export declare const CURRENT_STATE_VERSION = 1;
export declare const MAX_INTERVAL_DAYS = 30;
export interface UpdateCheckStateInput {
    version?: number;
    lastCheck?: Date | string | null;
    last_check?: Date | string | null;
}
export interface LocalUpdateCheckResult {
    enabled: boolean;
    stateFile: string;
    lastCheck: Date | null;
    shouldCheck: boolean;
    networkSkipped: boolean;
}
export declare function formatUtcIso(date: Date): string;
export declare function parseDurationSeconds(text: string): number;
export declare class UpdateCheckState {
    readonly version: number;
    lastCheck: Date | null;
    constructor(input?: UpdateCheckStateInput);
    static fromData(data: unknown): UpdateCheckState;
    static load(stateFile: string): Promise<UpdateCheckState>;
    toJSON(): {
        version: number;
        last_check: string | null;
    };
    save(stateFile: string): Promise<void>;
    updateLastCheck(now?: Date): void;
    shouldCheck(interval: string, channel?: string, now?: Date): boolean;
}
export declare function inspectLocalUpdateCheck({ config, stateFile, skipIntervalCheck, now, }: {
    config: Config;
    stateFile: string;
    skipIntervalCheck?: boolean;
    now?: Date;
}): Promise<LocalUpdateCheckResult>;
