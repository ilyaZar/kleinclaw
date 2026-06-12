/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
export const TIMING_FILE = "timing_data.json";
export const TIMING_RETENTION_DAYS = 30;
export class TimingCollector {
    outputDir;
    command;
    sessionId;
    startedAt;
    records = [];
    flushed = false;
    now;
    constructor(outputDir, command, { now = () => new Date() } = {}) {
        this.outputDir = path.resolve(outputDir);
        this.command = command;
        this.sessionId = randomUUID().replaceAll("-", "").slice(0, 8);
        this.now = now;
        this.startedAt = this.now().toISOString();
    }
    record(input) {
        this.records.push({
            timestamp: this.now().toISOString(),
            operation_key: input.key,
            operation_type: input.operationType,
            description: input.description,
            configured_timeout_sec: input.configuredTimeout,
            effective_timeout_sec: input.effectiveTimeout,
            actual_duration_sec: input.actualDuration,
            attempt_index: input.attemptIndex,
            success: input.success,
        });
    }
    flush() {
        if (this.flushed || this.records.length === 0) {
            return null;
        }
        try {
            fs.mkdirSync(this.outputDir, { recursive: true });
            const outputFile = path.join(this.outputDir, TIMING_FILE);
            const sessions = this.retainedSessions([
                ...this.loadExistingSessions(outputFile),
                {
                    command: this.command,
                    ended_at: this.now().toISOString(),
                    records: this.records,
                    session_id: this.sessionId,
                    started_at: this.startedAt,
                },
            ]);
            const tempFile = path.join(this.outputDir, `.${TIMING_FILE}.${this.sessionId}.tmp`);
            const fd = fs.openSync(tempFile, "w");
            try {
                fs.writeFileSync(fd, `${JSON.stringify(sessions, null, 2)}\n`, "utf8");
                fs.fsyncSync(fd);
            }
            finally {
                fs.closeSync(fd);
            }
            fs.renameSync(tempFile, outputFile);
            this.records = [];
            this.flushed = true;
            return outputFile;
        }
        catch {
            return null;
        }
    }
    loadExistingSessions(filePath) {
        if (!fs.existsSync(filePath)) {
            return [];
        }
        try {
            const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
            if (!Array.isArray(payload)) {
                return [];
            }
            return payload.filter(isTimingSession);
        }
        catch {
            return [];
        }
    }
    retainedSessions(sessions) {
        const cutoff = this.now().getTime() -
            TIMING_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        return sessions.filter((session) => {
            const startedAt = Date.parse(session.started_at);
            return Number.isFinite(startedAt) && startedAt >= cutoff;
        });
    }
}
function isTimingSession(value) {
    return typeof value === "object" &&
        value !== null &&
        "session_id" in value &&
        "command" in value &&
        "started_at" in value &&
        "records" in value &&
        Array.isArray(value.records);
}
