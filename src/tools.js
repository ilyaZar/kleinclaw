import path from "node:path";

import {
  buildRedactions,
  checkKleinanzeigenBrowser,
  configureKleinanzeigenBrowser,
  getKleinanzeigenBrowserStatus,
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
  "kleinanzeigen_browser_configure",
]);

export const OPTIONAL_TOOL_NAMES = new Set([
  "kleinanzeigen_status",
  "kleinanzeigen_list_ads",
  "kleinanzeigen_browser_status",
  "kleinanzeigen_browser_check",
  "kleinanzeigen_verify",
  ...SIDE_EFFECT_TOOL_NAMES,
]);

export const APPROVAL_TOOL_NAMES = new Set(OPTIONAL_TOOL_NAMES);

export function resolveApprovalToolNames(config = {}) {
  const mode = typeof config.approvalMode === "string" ? config.approvalMode : "all";

  if (mode === "none") {
    return new Set();
  }

  if (mode === "mutating") {
    return new Set(SIDE_EFFECT_TOOL_NAMES);
  }

  return new Set(APPROVAL_TOOL_NAMES);
}

function relativeConfiguredPath(value, config = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const raw = value.trim();
  const resolved = path.resolve(raw);
  for (const root of Array.isArray(config.adRoots) ? config.adRoots : []) {
    if (typeof root !== "string" || root.trim() === "") {
      continue;
    }
    const rootResolved = path.resolve(root);
    const relative = path.relative(rootResolved, resolved);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return relative || path.basename(rootResolved);
    }
  }

  if (!path.isAbsolute(raw)) {
    return raw;
  }

  return `[redacted-path]/${path.basename(resolved)}`;
}

function summarizeList(values, config) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  return values
    .map((value) => relativeConfiguredPath(value, config))
    .filter(Boolean)
    .join(", ");
}

function truncateLine(value, max = 500) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}

export function buildKleinanzeigenApprovalDescription({ toolName, params = {}, config = {} }) {
  const operation = toolName.replace(/^kleinanzeigen_/, "");
  const lines = [
    "Allow this local kleinanzeigen-bot operation to run with redacted output.",
    `Operation: ${operation}`,
  ];

  if (typeof params.selector === "string") {
    lines.push(`Selector: ${params.selector}`);
  }
  if (Array.isArray(params.selectors) && params.selectors.length > 0) {
    lines.push(`Selectors: ${params.selectors.join(", ")}`);
  }
  if (Array.isArray(params.adIds) && params.adIds.length > 0) {
    lines.push(`Ad IDs: ${params.adIds.join(", ")}`);
  }

  const adDirectories = summarizeList(params.adDirectories, config);
  if (adDirectories) {
    lines.push(`Ad directories: ${adDirectories}`);
  }

  const adConfigPaths = summarizeList(params.adConfigPaths, config);
  if (adConfigPaths) {
    lines.push(`Ad config files: ${adConfigPaths}`);
  }

  if (operation === "browser_configure" || operation === "browser_check") {
    if (typeof params.browser === "string") {
      lines.push(`Browser: ${params.browser}`);
    }
    if (typeof params.binaryLocation === "string") {
      lines.push(`Browser binary: ${relativeConfiguredPath(params.binaryLocation, config)}`);
    }
    if (typeof params.usePrivateWindow === "boolean") {
      lines.push(`Private window: ${params.usePrivateWindow}`);
    }
    if (typeof params.profileMode === "string") {
      lines.push(`Profile mode: ${params.profileMode}`);
    }
    if (typeof params.userDataDir === "string") {
      lines.push(`User data dir: ${relativeConfiguredPath(params.userDataDir, config)}`);
    }
    if (typeof params.profileName === "string") {
      lines.push(`Profile name: ${params.profileName || "(default)"}`);
    }
    if (typeof params.allowUnsupportedBrowser === "boolean") {
      lines.push(`Allow unsupported browser: ${params.allowUnsupportedBrowser}`);
    }
  } else if (!adDirectories && !adConfigPaths && !Array.isArray(params.adIds)) {
    lines.push("Scope: bot config default selection");
  }
  if (typeof params.keepOld === "boolean") {
    lines.push(`Keep old ads: ${params.keepOld}`);
  }
  if (typeof params.confirm === "boolean") {
    lines.push(`Confirm: ${params.confirm}`);
  }

  return lines.map((line) => truncateLine(line)).join("\n");
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

const browserSchema = {
  type: "string",
  enum: ["auto", "chromium", "google-chrome", "microsoft-edge"],
  description:
    "Browser to write into browser.binary_location. Auto clears the value and uses bot detection.",
};

const profileModeSchema = {
  type: "string",
  enum: ["bot", "system-default", "custom"],
  description: [
    "bot clears profile settings, system-default uses the chosen browser's",
    "normal profile root, custom uses userDataDir.",
  ].join(" "),
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

function browserStatusTool(config) {
  return bindToolConfig(
    {
      name: "kleinanzeigen_browser_status",
      label: "Kleinanzeigen Browser Status",
      description:
        "Read the non-secret browser section and detected local browser binaries.",
      parameters: objectSchema({}),
      async execute(_toolCallId) {
        try {
          return textResult(await getKleinanzeigenBrowserStatus(this.config));
        } catch (error) {
          const stderr = sanitizeText(
            error instanceof Error ? error.message : String(error),
            buildRedactions(this.config),
            2000,
          );
          return textResult({
            ok: false,
            operation: "browser_status",
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

function browserConfigureTool(config) {
  return bindToolConfig(
    {
      name: "kleinanzeigen_browser_configure",
      label: "Kleinanzeigen Browser Configure",
      description:
        "Change only the local bot browser config after explicit user confirmation.",
      parameters: objectSchema(
        {
          confirm: confirmSchema,
          browser: browserSchema,
          binaryLocation: {
            type: "string",
            description:
              "Explicit executable path. Use browser for known installed browsers when possible.",
          },
          usePrivateWindow: {
            type: "boolean",
            description: "Whether the bot should launch a private or incognito browser window.",
          },
          profileMode: profileModeSchema,
          userDataDir: {
            type: "string",
            description: "Browser user data directory. Required when profileMode is custom.",
          },
          profileName: {
            type: "string",
            description: "Optional browser profile directory name, such as Default or Profile 1.",
          },
          allowUnsupportedBrowser: {
            type: "boolean",
            description:
              "Allow binaryLocation to point at a custom browser that the bot does not officially support.",
          },
        },
        ["confirm"],
      ),
      async execute(_toolCallId, params) {
        try {
          return textResult(await configureKleinanzeigenBrowser(params ?? {}, this.config));
        } catch (error) {
          const stderr = sanitizeText(
            error instanceof Error ? error.message : String(error),
            buildRedactions(this.config),
            2000,
          );
          return textResult({
            ok: false,
            operation: "browser_configure",
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

function browserCheckTool(config) {
  return bindToolConfig(
    {
      name: "kleinanzeigen_browser_check",
      label: "Kleinanzeigen Browser Check",
      description:
        "Run kleinanzeigen-bot browser diagnostics against current or temporary browser settings.",
      parameters: objectSchema({
        browser: browserSchema,
        binaryLocation: {
          type: "string",
          description:
            "Explicit executable path. Use browser for known installed browsers when possible.",
        },
        usePrivateWindow: {
          type: "boolean",
          description: "Whether the checked config should use a private or incognito window.",
        },
        profileMode: profileModeSchema,
        userDataDir: {
          type: "string",
          description: "Browser user data directory. Required when profileMode is custom.",
        },
        profileName: {
          type: "string",
          description: "Optional browser profile directory name, such as Default or Profile 1.",
        },
        allowUnsupportedBrowser: {
          type: "boolean",
          description:
            "Allow binaryLocation to point at a custom browser that the bot does not officially support.",
        },
      }),
      async execute(_toolCallId, params) {
        try {
          return textResult(await checkKleinanzeigenBrowser(params ?? {}, this.config));
        } catch (error) {
          const stderr = sanitizeText(
            error instanceof Error ? error.message : String(error),
            buildRedactions(this.config),
            2000,
          );
          return textResult({
            ok: false,
            operation: "browser_check",
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
    browserStatusTool(config),
    browserCheckTool(config),
    browserConfigureTool(config),
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
