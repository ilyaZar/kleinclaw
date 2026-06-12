import { type LoginOptions } from "../auth.js";
import { type DiagnosticsPage } from "../diagnostics.js";
import { type Config } from "../model/config-model.js";
import { type CapturePublishError } from "../publish-orchestration.js";
import { TimingCollector } from "../timing-collector.js";
interface DiagnosticsController {
    readonly page?: (DiagnosticsPage & {
        url?: string;
    }) | null;
}
export declare function createLoginDiagnosticsCapture(config: Config, { configPath, controller, diagnosticsDir, logFilePath, now, }: {
    configPath?: string;
    controller: DiagnosticsController;
    diagnosticsDir?: string;
    logFilePath?: string | null;
    now: () => Date;
}): LoginOptions["captureDiagnostics"] | undefined;
export declare function createPublishDiagnosticsCapture(config: Config, { configPath, controller, diagnosticsDir, logFilePath, now, }: {
    configPath?: string;
    controller: DiagnosticsController;
    diagnosticsDir?: string;
    logFilePath?: string | null;
    now: () => Date;
}): CapturePublishError | undefined;
export declare function createTimingCollector(config: Config, { command, configPath, diagnosticsDir, now, }: {
    command: string;
    configPath?: string;
    diagnosticsDir?: string;
    now: () => Date;
}): TimingCollector | null;
export {};
