export interface CaptureOnConfigInput {
    loginDetection?: boolean;
    login_detection?: boolean;
    publish?: boolean;
}
export declare class CaptureOnConfig {
    readonly loginDetection: boolean;
    readonly publish: boolean;
    constructor(input?: CaptureOnConfigInput);
}
export interface DiagnosticsConfigInput {
    captureOn?: CaptureOnConfigInput;
    capture_on?: CaptureOnConfigInput;
    captureLogCopy?: boolean;
    capture_log_copy?: boolean;
    login_detection_capture?: boolean;
    outputDir?: string | null;
    output_dir?: string | null;
    pauseOnLoginDetectionFailure?: boolean;
    pause_on_login_detection_failure?: boolean;
    publish_error_capture?: boolean;
    timingCollection?: boolean;
    timing_collection?: boolean;
}
export declare class DiagnosticsConfig {
    readonly captureOn: CaptureOnConfig;
    readonly captureLogCopy: boolean;
    readonly outputDir: string | null;
    readonly pauseOnLoginDetectionFailure: boolean;
    readonly timingCollection: boolean;
    constructor(input?: DiagnosticsConfigInput);
}
