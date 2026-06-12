/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { ValidationError } from "./validation-error.js";
export class CaptureOnConfig {
    loginDetection;
    publish;
    constructor(input = {}) {
        this.loginDetection = input.loginDetection ?? input.login_detection ?? false;
        this.publish = input.publish ?? false;
    }
}
export class DiagnosticsConfig {
    captureOn;
    captureLogCopy;
    outputDir;
    pauseOnLoginDetectionFailure;
    timingCollection;
    constructor(input = {}) {
        const captureOnInput = {
            ...(input.captureOn ?? input.capture_on ?? {}),
        };
        if (input.login_detection_capture !== undefined &&
            captureOnInput.loginDetection === undefined &&
            captureOnInput.login_detection === undefined) {
            captureOnInput.loginDetection = input.login_detection_capture;
        }
        if (input.publish_error_capture !== undefined &&
            captureOnInput.publish === undefined) {
            captureOnInput.publish = input.publish_error_capture;
        }
        this.captureOn = new CaptureOnConfig(captureOnInput);
        this.captureLogCopy =
            input.captureLogCopy ?? input.capture_log_copy ?? false;
        this.outputDir = input.outputDir ?? input.output_dir ?? null;
        this.pauseOnLoginDetectionFailure =
            input.pauseOnLoginDetectionFailure ??
                input.pause_on_login_detection_failure ??
                false;
        this.timingCollection =
            input.timingCollection ?? input.timing_collection ?? true;
        if (this.pauseOnLoginDetectionFailure &&
            !this.captureOn.loginDetection) {
            throw new ValidationError("pause_on_login_detection_failure requires " +
                "capture_on.login_detection to be enabled");
        }
    }
}
