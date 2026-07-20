import {
  buildRedactions, sanitizeText, type RedactionConfig,
} from "./process-boundary.js";
import { type Schema } from "./tools-schemas.js";

export interface Config extends RedactionConfig {
  approvalMode?: unknown;
  [key: string]: unknown;
}
export type Params = Record<string, unknown>;
export type Payload = Record<string, unknown>;
export type ToolHandler = (
  config: Config,
  params: Params,
) => Payload | Promise<Payload>;
export interface ToolDefinition {
  description: string;
  handler: ToolHandler;
  label: string;
  operation: string;
  parameters: Schema;
}

function textResult(payload: Payload) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(payload, null, 2),
    }],
    details: {
      ok: payload.ok,
      operation: payload.operation,
      exitCode: payload.exitCode,
      timedOut: payload.timedOut,
      needsUserAction: payload.needsUserAction ?? false,
    },
  };
}

export type ToolResult = ReturnType<typeof textResult>;
export interface KleinanzeigenTool {
  description: string;
  execute(toolCallId: string, params?: Params): Promise<ToolResult>;
  label: string;
  name: string;
  parameters: Schema;
}

function errorTextResult(
  error: unknown,
  operation: string,
  config: Config,
): ToolResult {
  const stderr = sanitizeText(
    error instanceof Error ? error.message : String(error),
    buildRedactions(config),
    2000,
  );
  const payload: Payload = {
    ok: false,
    operation,
    exitCode: null,
    signal: null,
    timedOut: false,
    needsUserAction: false,
  };
  return textResult({ ...payload, stdout: "", stderr });
}

export function handledTool(
  config: Config,
  { operation, handler, ...tool }: ToolDefinition,
): KleinanzeigenTool {
  return {
    ...tool,
    name: `kleinanzeigen_${operation}`,
    label: `Kleinanzeigen ${tool.label}`,
    async execute(_toolCallId, params = {}) {
      try {
        return textResult(await handler(config, params));
      } catch (error) {
        return errorTextResult(error, operation, config);
      }
    },
  };
}
