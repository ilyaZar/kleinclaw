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

export class TimingCollector implements TimingRecorder {
  readonly outputDir: string;
  readonly command: string;
  readonly sessionId: string;
  readonly startedAt: string;
  records: TimingRecord[] = [];

  private flushed = false;
  private readonly now: () => Date;

  constructor(
    outputDir: string,
    command: string,
    { now = () => new Date() }: { now?: () => Date } = {},
  ) {
    this.outputDir = path.resolve(outputDir);
    this.command = command;
    this.sessionId = randomUUID().replaceAll("-", "").slice(0, 8);
    this.now = now;
    this.startedAt = this.now().toISOString();
  }

  record(input: TimingRecordInput): void {
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

  flush(): string | null {
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
      const tempFile = path.join(
        this.outputDir,
        `.${TIMING_FILE}.${this.sessionId}.tmp`,
      );
      const fd = fs.openSync(tempFile, "w");
      try {
        fs.writeFileSync(fd, `${JSON.stringify(sessions, null, 2)}\n`, "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tempFile, outputFile);
      this.records = [];
      this.flushed = true;
      return outputFile;
    } catch {
      return null;
    }
  }

  private loadExistingSessions(filePath: string): TimingSession[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(payload)) {
        return [];
      }
      return payload.filter(isTimingSession);
    } catch {
      return [];
    }
  }

  private retainedSessions(sessions: TimingSession[]): TimingSession[] {
    const cutoff = this.now().getTime() -
      TIMING_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return sessions.filter((session) => {
      const startedAt = Date.parse(session.started_at);
      return Number.isFinite(startedAt) && startedAt >= cutoff;
    });
  }
}

function isTimingSession(value: unknown): value is TimingSession {
  return typeof value === "object" &&
    value !== null &&
    "session_id" in value &&
    "command" in value &&
    "started_at" in value &&
    "records" in value &&
    Array.isArray((value as { records?: unknown }).records);
}
