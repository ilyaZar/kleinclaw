import { buildRedactions, runKleinanzeigenOperation, sanitizeText } from "./cli.js";

export const SIDE_EFFECT_TOOL_NAMES = new Set([
  "kleinanzeigen_publish",
  "kleinanzeigen_update",
  "kleinanzeigen_delete",
  "kleinanzeigen_download",
  "kleinanzeigen_extend",
]);

export const OPTIONAL_TOOL_NAMES = new Set([
  "kleinanzeigen_verify",
  ...SIDE_EFFECT_TOOL_NAMES,
]);

export const APPROVAL_TOOL_NAMES = new Set(OPTIONAL_TOOL_NAMES);

const adIdsSchema = {
  type: "array",
  minItems: 1,
  maxItems: 50,
  items: {
    type: "string",
    pattern: "^[0-9]+$",
  },
  description: "Explicit numeric Kleinanzeigen ad IDs.",
};

const confirmSchema = {
  type: "boolean",
  const: true,
  description: "Must be true only after the user explicitly confirms this operation.",
};

function textResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: {
      ok: payload.ok,
      operation: payload.operation,
      exitCode: payload.exitCode,
      timedOut: payload.timedOut,
    },
  };
}

function objectSchema(properties, required = []) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  };
}

function operationTool({ name, label, description, operation, parameters }) {
  return {
    name,
    label,
    description,
    parameters,
    async execute(_toolCallId, params) {
      try {
        return textResult(await runKleinanzeigenOperation(operation, params ?? {}, this.config));
      } catch (error) {
        const stderr = sanitizeText(
          error instanceof Error ? error.message : String(error),
          buildRedactions(this.config),
          2000,
        );
        return textResult({
          ok: false,
          operation,
          exitCode: null,
          signal: null,
          timedOut: false,
          stdout: "",
          stderr,
        });
      }
    },
  };
}

function bindToolConfig(tool, config) {
  const execute = tool.execute;
  return {
    ...tool,
    execute(toolCallId, params) {
      return execute.call({ config }, toolCallId, params);
    },
  };
}

export function createKleinanzeigenTools(config = {}) {
  return [
    bindToolConfig(
      operationTool({
        name: "kleinanzeigen_verify",
        label: "Kleinanzeigen Verify",
        description:
          "Verify the already configured local kleinanzeigen-bot setup and return sanitized output.",
        operation: "verify",
        parameters: objectSchema({}),
      }),
      config,
    ),
    bindToolConfig(
      operationTool({
        name: "kleinanzeigen_publish",
        label: "Kleinanzeigen Publish",
        description:
          "Publish or republish configured ads via kleinanzeigen-bot after explicit user confirmation.",
        operation: "publish",
        parameters: objectSchema(
          {
            confirm: confirmSchema,
            selector: {
              type: "string",
              enum: ["due", "new", "changed", "all"],
              description: "Configured ad selector. Defaults to due.",
            },
            adIds: adIdsSchema,
            keepOld: {
              type: "boolean",
              description: "Keep old ads during republication.",
            },
          },
          ["confirm"],
        ),
      }),
      config,
    ),
    bindToolConfig(
      operationTool({
        name: "kleinanzeigen_update",
        label: "Kleinanzeigen Update",
        description:
          "Update configured ads via kleinanzeigen-bot after explicit user confirmation.",
        operation: "update",
        parameters: objectSchema(
          {
            confirm: confirmSchema,
            selector: {
              type: "string",
              enum: ["changed"],
              description: "Configured ad selector. Defaults to changed.",
            },
            adIds: adIdsSchema,
          },
          ["confirm"],
        ),
      }),
      config,
    ),
    bindToolConfig(
      operationTool({
        name: "kleinanzeigen_delete",
        label: "Kleinanzeigen Delete",
        description:
          "Delete explicitly selected Kleinanzeigen ads via kleinanzeigen-bot after confirmation.",
        operation: "delete",
        parameters: objectSchema(
          {
            confirm: confirmSchema,
            adIds: adIdsSchema,
          },
          ["confirm", "adIds"],
        ),
      }),
      config,
    ),
    bindToolConfig(
      operationTool({
        name: "kleinanzeigen_download",
        label: "Kleinanzeigen Download",
        description:
          "Download configured ads via kleinanzeigen-bot after explicit user confirmation.",
        operation: "download",
        parameters: objectSchema(
          {
            confirm: confirmSchema,
            selector: {
              type: "string",
              enum: ["new", "all"],
              description: "Configured ad selector. Defaults to new.",
            },
            adIds: adIdsSchema,
          },
          ["confirm"],
        ),
      }),
      config,
    ),
    bindToolConfig(
      operationTool({
        name: "kleinanzeigen_extend",
        label: "Kleinanzeigen Extend",
        description:
          "Extend eligible configured ads via kleinanzeigen-bot after explicit user confirmation.",
        operation: "extend",
        parameters: objectSchema(
          {
            confirm: confirmSchema,
            selector: {
              type: "string",
              enum: ["all"],
              description: "Configured ad selector. Defaults to all.",
            },
            adIds: adIdsSchema,
          },
          ["confirm"],
        ),
      }),
      config,
    ),
  ];
}
