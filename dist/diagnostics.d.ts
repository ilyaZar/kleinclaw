export interface DiagnosticsPage {
    content?(): Promise<string>;
    get_content?(): Promise<string>;
    save_screenshot?(filePath: string): Promise<void>;
    screenshot?(options: {
        path: string;
    }): Promise<unknown>;
}
export interface CaptureDiagnosticsOptions {
    outputDir: string;
    basePrefix: string;
    attempt?: number | null;
    subject?: string | null;
    page?: DiagnosticsPage | null;
    jsonPayload?: Record<string, unknown> | null;
    logFilePath?: string | null;
    copyLog?: boolean;
    now?: () => Date;
    randomHex?: () => string;
}
export declare class CaptureResult {
    readonly savedArtifacts: string[];
    addSaved(filePath: string): void;
    hasAny(): boolean;
}
export declare function writeJson(jsonPath: string, jsonPayload: Record<string, unknown>): Promise<void>;
export declare function copyLog(logFilePath: string, logPath: string): Promise<boolean>;
export declare function captureDiagnostics({ attempt, basePrefix, copyLog: shouldCopyLog, jsonPayload, logFilePath, now, outputDir, page, randomHex, subject, }: CaptureDiagnosticsOptions): Promise<CaptureResult>;
