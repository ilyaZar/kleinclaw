import {
  buildRedactions,
  getKleinanzeigenStatus,
  listKleinanzeigenAds,
  runKleinanzeigenOperation,
  sanitizeText,
} from "./cli.js";

export const SIDE_EFFECT_TOOL_NAMES = new Set([
  "kleinanzeigen_publish",
  "kleinanzeigen_update",
  "kleinanzeigen_delete",
  "kleinanzeigen_download",
  "kleinanzeigen_extend",
]);

export const OPTIONAL_TOOL_NAMES = new Set([
  "kleinanzeigen_status",
  "kleinanzeigen_list_ads",
  "kleinanzeigen_verify",
  ...SIDE_EFFECT_TOOL_NAMES,
]);

export const APPROVAL_TOOL_NAMES = new Set(OPTIONAL_TOOL_NAMES);

export function resolveApprovalToolNames(config = {}) {
  const mode = typeof config.approvalMode === "string" ? config.approvalMode : "all";

  if (mode === "mutating") {
    return new Set(SIDE_EFFECT_TOOL_NAMES);
  }

  return new Set(APPROVAL_TOOL_NAMES);
}

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

const adConfigPathsSchema = {
  type: "array",
  minItems: 1,
  maxItems: 20,
  items: {
    type: "string",
  },
  description:
    "Explicit ad YAML/JSON files to scope this operation to. Paths must be inside configured adRoots.",
};

const adDirectoriesSchema = {
  type: "array",
  minItems: 1,
  maxItems: 20,
  items: {
    type: "string",
  },
  description:
    "Directories containing ad.yaml, ad.yml, or ad.json to scope this operation to. Paths must be inside configured adRoots.",
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
      needsUserAction: payload.needsUserAction ?? false,
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

function listAdsTool(config) {
  return bindToolConfig(
    {
      name: "kleinanzeigen_list_ads",
      label: "Kleinanzeigen List Ads",
      description:
        "List configured local ad folders under trusted adRoots without publishing anything.",
      parameters: objectSchema({
        query: {
          type: "string",
          description: "Optional case-insensitive text to match path, title, ID, or category.",
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of matching ad summaries to return.",
        },
      }),
      async execute(_toolCallId, params) {
        try {
          return textResult(await listKleinanzeigenAds(this.config, params ?? {}));
        } catch (error) {
          const stderr = sanitizeText(
            error instanceof Error ? error.message : String(error),
            buildRedactions(this.config),
            2000,
          );
          return textResult({
            ok: false,
            operation: "list_ads",
            exitCode: null,
            signal: null,
            timedOut: false,
            needsUserAction: false,
            stdout: "",
            stderr,
          });
        }
      },
    },
    config,
  );
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
      {
        name: "kleinanzeigen_status",
        label: "Kleinanzeigen Status",
        description:
          "Check local kleinanzeigen-bot availability and config wiring without reading the config.",
        parameters: objectSchema({}),
        async execute(_toolCallId) {
          try {
            return textResult(await getKleinanzeigenStatus(this.config));
          } catch (error) {
            const stderr = sanitizeText(
              error instanceof Error ? error.message : String(error),
              buildRedactions(this.config),
              2000,
            );
            return textResult({
              ok: false,
              operation: "status",
              exitCode: null,
              signal: null,
              timedOut: false,
              needsUserAction: false,
              stdout: "",
              stderr,
            });
          }
        },
      },
      config,
    ),
    listAdsTool(config),
    bindToolConfig(
      operationTool({
        name: "kleinanzeigen_verify",
        label: "Kleinanzeigen Verify",
        description:
          "Verify the already configured local kleinanzeigen-bot setup and return sanitized output.",
        operation: "verify",
        parameters: objectSchema({
          adConfigPaths: adConfigPathsSchema,
          adDirectories: adDirectoriesSchema,
        }),
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
            selectors: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              uniqueItems: true,
              items: {
                type: "string",
                enum: ["due", "new", "changed", "all"],
              },
              description: "Publish selector list for combinations.",
            },
            adIds: adIdsSchema,
            adConfigPaths: adConfigPathsSchema,
            adDirectories: adDirectoriesSchema,
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
              enum: ["changed", "all"],
              description: "Configured ad selector. Defaults to changed.",
            },
            adIds: adIdsSchema,
            adConfigPaths: adConfigPathsSchema,
            adDirectories: adDirectoriesSchema,
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
            adConfigPaths: adConfigPathsSchema,
            adDirectories: adDirectoriesSchema,
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
            adConfigPaths: adConfigPathsSchema,
            adDirectories: adDirectoriesSchema,
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
            adConfigPaths: adConfigPathsSchema,
            adDirectories: adDirectoriesSchema,
          },
          ["confirm"],
        ),
      }),
      config,
    ),
  ];
}
