export declare const TIMING_FILE = "timing_data.json";
export declare const TIMING_RETENTION_DAYS = 30;
export interface TimingRecordInput {
    key: string;
    operationType: string;
    description: string;
    configuredTimeout: number;
    effectiveTimeout: number;
    actualDuration: number;
    attemptIndex: number;
    success: boolean;
}
export interface TimingRecord {
    timestamp: string;
    operation_key: string;
    operation_type: string;
    description: string;
    configured_timeout_sec: number;
    effective_timeout_sec: number;
    actual_duration_sec: number;
    attempt_index: number;
    success: boolean;
}
export interface TimingSession {
    session_id: string;
    command: string;
    started_at: string;
    ended_at: string;
    records: TimingRecord[];
}
export interface TimingRecorder {
    record(input: TimingRecordInput): void;
}
export declare class TimingCollector implements TimingRecorder {
    readonly outputDir: string;
    readonly command: string;
    readonly sessionId: string;
    readonly startedAt: string;
    records: TimingRecord[];
    private flushed;
    private readonly now;
    constructor(outputDir: string, command: string, { now }?: {
        now?: () => Date;
    });
    record(input: TimingRecordInput): void;
    flush(): string | null;
    private loadExistingSessions;
    private retainedSessions;
}
