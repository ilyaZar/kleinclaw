const STATUSES = new Set([
  "succeeded",
  "no_op",
  "partial_failure",
  "failed",
]);
const DIAGNOSTIC_CODES = new Set([
  "validation_error",
  "ip_range_blocked",
  "captcha",
  "manual_action_required",
  "browser_diagnostic",
  "internal_error",
]);
const SEVERITIES = new Set(["info", "warning", "error"]);

interface Counts {
  changed: number;
  failed: number;
  skipped?: number;
  total: number;
}

export interface MiniclawDiagnostic {
  code: string;
  severity: string;
  message: string;
  retryAfterSeconds?: number;
}

export interface MiniclawResult {
  schemaVersion: 1;
  command: string;
  status: string;
  counts?: Counts;
  diagnostics: MiniclawDiagnostic[];
  version?: string;
  commands?: string[];
}

interface Transport {
  exitCode: number | null;
  timedOut: boolean;
}

export type ParsedMiniclawResult =
  | { ok: true; result: MiniclawResult }
  | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function parseCounts(value: unknown): Counts | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.changed) ||
    !isNonNegativeInteger(value.failed) ||
    !isNonNegativeInteger(value.total) ||
    (
      value.skipped !== undefined &&
      !isNonNegativeInteger(value.skipped)
    ) ||
    value.changed + value.failed + Number(value.skipped ?? 0) !== value.total
  ) {
    throw new Error("invalid counts");
  }
  return {
    changed: value.changed,
    failed: value.failed,
    ...(value.skipped === undefined ? {} : { skipped: value.skipped }),
    total: value.total,
  };
}

function parseDiagnostics(value: unknown): MiniclawDiagnostic[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error("invalid diagnostics");
  }
  return value.map((entry) => {
    if (
      !isRecord(entry) ||
      !DIAGNOSTIC_CODES.has(String(entry.code)) ||
      !SEVERITIES.has(String(entry.severity)) ||
      typeof entry.message !== "string" ||
      entry.message.length > 2000 ||
      (
        entry.retryAfterSeconds !== undefined &&
        !isNonNegativeInteger(entry.retryAfterSeconds)
      )
    ) {
      throw new Error("invalid diagnostic");
    }
    return {
      code: String(entry.code),
      severity: String(entry.severity),
      message: entry.message,
      ...(entry.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: entry.retryAfterSeconds }),
    };
  });
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    value.some((entry) => typeof entry !== "string" || entry.length > 100)
  ) {
    throw new Error("invalid string array");
  }
  return value;
}

export function parseMiniclawResult(
  stdout: string,
  expectedCommand: string,
  transport: Transport,
): ParsedMiniclawResult {
  try {
    const value: unknown = JSON.parse(stdout.trim());
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      value.command !== expectedCommand ||
      !STATUSES.has(String(value.status))
    ) {
      return { ok: false };
    }

    const result: MiniclawResult = {
      schemaVersion: 1,
      command: value.command,
      status: String(value.status),
      counts: parseCounts(value.counts),
      diagnostics: parseDiagnostics(value.diagnostics),
      version: typeof value.version === "string" ? value.version : undefined,
      commands: parseStringArray(value.commands),
    };
    const successful = result.status === "succeeded" ||
      result.status === "no_op";
    const countsCoherent = !result.counts ||
      (
        result.status === "succeeded" &&
        result.counts.changed > 0 &&
        result.counts.failed === 0
      ) ||
      (
        result.status === "no_op" &&
        result.counts.changed === 0 &&
        result.counts.failed === 0
      ) ||
      (
        result.status === "partial_failure" &&
        result.counts.changed > 0 &&
        result.counts.failed > 0
      ) ||
      (
        result.status === "failed" &&
        result.counts.changed === 0 &&
        result.counts.failed > 0
      );
    if (
      transport.timedOut ||
      !countsCoherent ||
      (result.status === "partial_failure" && !result.counts) ||
      (successful && transport.exitCode !== 0) ||
      (expectedCommand === "version" && (!result.version || !result.commands))
    ) {
      return { ok: false };
    }
    return { ok: true, result };
  } catch {
    return { ok: false };
  }
}
