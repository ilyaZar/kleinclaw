/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import path from "node:path";
import { captureDiagnostics, } from "../diagnostics.js";
import { TimingCollector } from "../timing-collector.js";
function diagnosticsOutputDir(config, { configPath, diagnosticsDir, }) {
    const configured = config.diagnostics.outputDir?.trim();
    if (configured) {
        return path.resolve(configPath ? path.dirname(configPath) : process.cwd(), configured);
    }
    if (diagnosticsDir) {
        return diagnosticsDir;
    }
    if (configPath) {
        return path.join(path.dirname(configPath), ".temp", "diagnostics");
    }
    return null;
}
function errorSummary(error) {
    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
        };
    }
    return {
        message: String(error),
        name: typeof error,
    };
}
export function createLoginDiagnosticsCapture(config, { configPath, controller, diagnosticsDir, logFilePath, now, }) {
    if (!config.diagnostics.captureOn.loginDetection) {
        return undefined;
    }
    const outputDir = diagnosticsOutputDir(config, { configPath, diagnosticsDir });
    if (!outputDir) {
        return undefined;
    }
    let captured = false;
    return async (context) => {
        if (captured) {
            return;
        }
        const result = await captureDiagnostics({
            basePrefix: context.basePrefix,
            copyLog: config.diagnostics.captureLogCopy,
            logFilePath,
            now,
            outputDir,
            page: controller.page,
        });
        if (result.hasAny()) {
            captured = true;
        }
    };
}
export function createPublishDiagnosticsCapture(config, { configPath, diagnosticsDir, logFilePath, now, }) {
    if (!config.diagnostics.captureOn.publish) {
        return undefined;
    }
    const outputDir = diagnosticsOutputDir(config, { configPath, diagnosticsDir });
    if (!outputDir) {
        return undefined;
    }
    return async (context) => {
        await captureDiagnostics({
            attempt: context.attempt,
            basePrefix: "publish_error",
            copyLog: config.diagnostics.captureLogCopy,
            jsonPayload: {
                attempt: context.attempt,
                exception: errorSummary(context.error),
                timestamp: now().toISOString().replace(/\.\d{3}Z$/, ""),
            },
            logFilePath,
            now,
            outputDir,
        });
    };
}
function timingOutputDir({ configPath, diagnosticsDir, }) {
    if (diagnosticsDir) {
        return path.join(path.dirname(diagnosticsDir), "timing");
    }
    if (configPath) {
        return path.join(path.dirname(configPath), ".temp", "timing");
    }
    return null;
}
export function createTimingCollector(config, { command, configPath, diagnosticsDir, now, }) {
    if (!config.diagnostics.timingCollection) {
        return null;
    }
    const outputDir = timingOutputDir({ configPath, diagnosticsDir });
    return outputDir ? new TimingCollector(outputDir, command, { now }) : null;
}
