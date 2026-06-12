/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import fs from "node:fs/promises";
import path from "node:path";

import { type Config } from "./model/config-model.js";
import { isRecord } from "./value-guards.js";
import { ensureDirectory } from "./workspace.js";

export const CURRENT_STATE_VERSION = 1;
export const MAX_INTERVAL_DAYS = 30;

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

function parseTimestamp(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

export function formatUtcIso(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    ":",
    pad(date.getUTCMinutes()),
    ":",
    pad(date.getUTCSeconds()),
    "+00:00",
  ].join("");
}

export function parseDurationSeconds(text: string): number {
  const pattern = /(\d+)\s*([dhms])/g;
  let total = 0;
  for (const match of text.toLowerCase().matchAll(pattern)) {
    const value = Number(match[1]);
    switch (match[2]) {
      case "d":
        total += value * 86400;
        break;
      case "h":
        total += value * 3600;
        break;
      case "m":
        total += value * 60;
        break;
      case "s":
        total += value;
        break;
    }
  }
  return total;
}

function validateUpdateInterval(interval: string): {
  seconds: number;
  isValid: boolean;
  reason: string;
} {
  const seconds = parseDurationSeconds(interval);
  if (seconds === 0) {
    if (["0d", "0h", "0m", "0s", "0"].includes(interval.trim())) {
      return {
        seconds,
        isValid: false,
        reason: "Interval is zero, which is not allowed.",
      };
    }
    return {
      seconds,
      isValid: false,
      reason: "Invalid interval format or unsupported unit.",
    };
  }
  if (seconds < 0) {
    return {
      seconds,
      isValid: false,
      reason: "Negative interval is not allowed.",
    };
  }
  return { seconds, isValid: true, reason: "" };
}

function fallbackIntervalSeconds(channel: string): number {
  return parseDurationSeconds(channel === "preview" ? "1d" : "7d");
}

export class UpdateCheckState {
  readonly version: number;
  lastCheck: Date | null;

  constructor(input: UpdateCheckStateInput = {}) {
    this.version = input.version ?? CURRENT_STATE_VERSION;
    this.lastCheck = parseTimestamp(input.lastCheck ?? input.last_check ?? null);
  }

  static fromData(data: unknown): UpdateCheckState {
    if (!isRecord(data)) {
      return new UpdateCheckState();
    }
    const version = typeof data.version === "number" ? data.version : 0;
    return new UpdateCheckState({
      version: version < CURRENT_STATE_VERSION ? CURRENT_STATE_VERSION : version,
      last_check: data.last_check instanceof Date || typeof data.last_check === "string"
        ? data.last_check
        : null,
    });
  }

  static async load(stateFile: string): Promise<UpdateCheckState> {
    try {
      const text = await fs.readFile(stateFile, "utf8");
      if (!text.trim()) {
        return new UpdateCheckState();
      }
      return UpdateCheckState.fromData(JSON.parse(text));
    } catch {
      return new UpdateCheckState();
    }
  }

  toJSON(): { version: number; last_check: string | null } {
    return {
      version: this.version,
      last_check: this.lastCheck ? formatUtcIso(this.lastCheck) : null,
    };
  }

  async save(stateFile: string): Promise<void> {
    try {
      await ensureDirectory(path.dirname(stateFile), "update check state directory");
      await fs.writeFile(
        stateFile,
        `${JSON.stringify(this.toJSON(), null, 2)}\n`,
        "utf8",
      );
    } catch {
      // Update-check state persistence failures are non-fatal.
    }
  }

  updateLastCheck(now = new Date()): void {
    this.lastCheck = now;
  }

  shouldCheck(interval: string, channel = "latest", now = new Date()): boolean {
    const validation = validateUpdateInterval(interval);
    let seconds = validation.seconds;
    const totalDays = seconds / 86400;
    const epsilon = 1e-6;

    if (
      !validation.isValid ||
      totalDays > MAX_INTERVAL_DAYS + epsilon ||
      totalDays < 1 - epsilon
    ) {
      seconds = fallbackIntervalSeconds(channel);
    }

    if (!this.lastCheck) {
      return true;
    }
    const elapsedSeconds = Math.trunc(
      (now.valueOf() - this.lastCheck.valueOf()) / 1000,
    );
    return elapsedSeconds > Math.trunc(seconds);
  }
}

export async function inspectLocalUpdateCheck({
  config,
  stateFile,
  skipIntervalCheck = false,
  now = new Date(),
}: {
  config: Config;
  stateFile: string;
  skipIntervalCheck?: boolean;
  now?: Date;
}): Promise<LocalUpdateCheckResult> {
  const state = await UpdateCheckState.load(stateFile);
  if (!config.updateCheck.enabled) {
    return {
      enabled: false,
      stateFile,
      lastCheck: state.lastCheck,
      shouldCheck: false,
      networkSkipped: false,
    };
  }

  const shouldCheck = skipIntervalCheck ||
    state.shouldCheck(
      config.updateCheck.interval,
      config.updateCheck.channel,
      now,
    );
  return {
    enabled: true,
    stateFile,
    lastCheck: state.lastCheck,
    shouldCheck,
    networkSkipped: shouldCheck,
  };
}
