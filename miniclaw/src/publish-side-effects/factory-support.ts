/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import path from "node:path";

import {
  type LoginDiagnosticsContext,
  type LoginOptions,
} from "../auth.js";
import {
  captureDiagnostics,
  type DiagnosticsPage,
} from "../diagnostics.js";
import { type Config } from "../model/config-model.js";
import {
  type CapturePublishError,
  type PublishErrorContext,
} from "../publish-orchestration.js";
import { TimingCollector } from "../timing-collector.js";

interface DiagnosticsController {
  readonly page?: (DiagnosticsPage & { url?: string }) | null;
}

function diagnosticsOutputDir(
  config: Config,
  {
    configPath,
    diagnosticsDir,
  }: {
    configPath?: string;
    diagnosticsDir?: string;
  },
): string | null {
  const configured = config.diagnostics.outputDir?.trim();
  if (configured) {
    return path.resolve(
      configPath ? path.dirname(configPath) : process.cwd(),
      configured,
    );
  }
  if (diagnosticsDir) {
    return diagnosticsDir;
  }
  if (configPath) {
    return path.join(path.dirname(configPath), ".temp", "diagnostics");
  }
  return null;
}

function errorSummary(error: unknown): Record<string, unknown> {
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

export function createLoginDiagnosticsCapture(
  config: Config,
  {
    configPath,
    controller,
    diagnosticsDir,
    logFilePath,
    now,
  }: {
    configPath?: string;
    controller: DiagnosticsController;
    diagnosticsDir?: string;
    logFilePath?: string | null;
    now: () => Date;
  },
): LoginOptions["captureDiagnostics"] | undefined {
  if (!config.diagnostics.captureOn.loginDetection) {
    return undefined;
  }
  const outputDir = diagnosticsOutputDir(config, { configPath, diagnosticsDir });
  if (!outputDir) {
    return undefined;
  }

  let captured = false;
  return async (context: LoginDiagnosticsContext) => {
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

export function createPublishDiagnosticsCapture(
  config: Config,
  {
    configPath,
    controller,
    diagnosticsDir,
    logFilePath,
    now,
  }: {
    configPath?: string;
    controller: DiagnosticsController;
    diagnosticsDir?: string;
    logFilePath?: string | null;
    now: () => Date;
  },
): CapturePublishError | undefined {
  if (!config.diagnostics.captureOn.publish) {
    return undefined;
  }
  const outputDir = diagnosticsOutputDir(config, { configPath, diagnosticsDir });
  if (!outputDir) {
    return undefined;
  }

  return async (context: PublishErrorContext) => {
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

function timingOutputDir({
  configPath,
  diagnosticsDir,
}: {
  configPath?: string;
  diagnosticsDir?: string;
}): string | null {
  if (diagnosticsDir) {
    return path.join(path.dirname(diagnosticsDir), "timing");
  }
  if (configPath) {
    return path.join(path.dirname(configPath), ".temp", "timing");
  }
  return null;
}

export function createTimingCollector(
  config: Config,
  {
    command,
    configPath,
    diagnosticsDir,
    now,
  }: {
    command: string;
    configPath?: string;
    diagnosticsDir?: string;
    now: () => Date;
  },
): TimingCollector | null {
  if (!config.diagnostics.timingCollection) {
    return null;
  }
  const outputDir = timingOutputDir({ configPath, diagnosticsDir });
  return outputDir ? new TimingCollector(outputDir, command, { now }) : null;
}
