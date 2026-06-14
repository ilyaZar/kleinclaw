import path from "node:path";

import {
  buildRedactions,
  checkKleinanzeigenBrowser,
  configureKleinanzeigenBrowser,
  draftKleinanzeigenAd,
  getKleinanzeigenAdSchema,
  getKleinanzeigenBrowserStatus,
  getKleinanzeigenStatus,
  listKleinanzeigenImages,
  listKleinanzeigenAds,
  readKleinanzeigenAd,
  runKleinanzeigenOperation,
  sanitizeText,
  setKleinanzeigenAdActive,
} from "./cli.js";

export const SIDE_EFFECT_TOOL_NAMES = new Set([
  "kleinanzeigen_publish",
  "kleinanzeigen_update",
  "kleinanzeigen_delete",
  "kleinanzeigen_download",
  "kleinanzeigen_extend",
  "kleinanzeigen_browser_configure",
  "kleinanzeigen_draft_ad",
  "kleinanzeigen_set_ad_active",
]);

export const OPTIONAL_TOOL_NAMES = new Set([
  "kleinanzeigen_status",
  "kleinanzeigen_list_ads",
  "kleinanzeigen_ad_schema",
  "kleinanzeigen_read_ad",
  "kleinanzeigen_images_list",
  "kleinanzeigen_browser_status",
  "kleinanzeigen_browser_check",
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
    "Allow this embedded miniclaw operation to run with redacted output.",
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
  } else if (operation === "draft_ad") {
    if (typeof params.directory === "string") {
      lines.push(`Draft directory: ${relativeConfiguredPath(params.directory, config)}`);
    }
    if (typeof params.fileName === "string") {
      lines.push(`Draft file: ${params.fileName}`);
    }
    if (typeof params.title === "string") {
      lines.push(`Title: ${params.title}`);
    }
    if (typeof params.category === "string") {
      lines.push(`Category: ${params.category}`);
    }
    if (typeof params.active === "boolean") {
      lines.push(`Active: ${params.active}`);
    }
    if (typeof params.overwrite === "boolean") {
      lines.push(`Overwrite: ${params.overwrite}`);
    }
  } else if (operation === "set_ad_active") {
    if (typeof params.active === "boolean") {
      lines.push(`Active: ${params.active}`);
    }
  } else if (!adDirectories && !adConfigPaths && !Array.isArray(params.adIds)) {
    lines.push("Scope: miniclaw config default selection");
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
  description: [
    "Directories containing ad.yaml, ad.yml, or ad.json to scope this operation to.",
    "Paths must be inside configured adRoots.",
  ].join(" "),
};

const singleAdConfigPathsSchema = {
  ...adConfigPathsSchema,
  maxItems: 1,
};

const singleAdDirectoriesSchema = {
  ...adDirectoriesSchema,
  maxItems: 1,
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
    "Browser to write into browser.binary_location. Auto clears the value and uses miniclaw detection.",
};

const profileModeSchema = {
  type: "string",
  enum: ["workspace", "system-default", "custom"],
  description: [
    "workspace clears profile settings, system-default uses the chosen browser's",
    "normal profile root, custom uses userDataDir.",
  ].join(" "),
};

const configurableProfileModeSchema = {
  type: "string",
  enum: ["workspace", "system-default"],
  description: [
    "workspace clears profile settings, system-default uses the chosen browser's",
    "normal profile root.",
  ].join(" "),
};

const draftStringMapSchema = {
  type: "object",
  additionalProperties: { type: "string" },
};

const draftAdProperties = {
  confirm: confirmSchema,
  directory: {
    type: "string",
    description:
      "Target draft directory inside configured adRoots. Relative paths resolve under the first adRoot.",
  },
  fileName: {
    type: "string",
    enum: ["ad.yaml", "ad.yml"],
    description: "Draft file name. Defaults to ad.yaml.",
  },
  overwrite: {
    type: "boolean",
    description: "Replace an existing draft file. Defaults to false.",
  },
  active: {
    type: "boolean",
    description: "Whether the ad is eligible for publish. Defaults to false for safe drafts.",
  },
  type: {
    type: "string",
    enum: ["OFFER", "WANTED"],
    description: "Listing type. Defaults to OFFER.",
  },
  title: {
    type: "string",
    minLength: 10,
    maxLength: 65,
    description: "Kleinanzeigen title.",
  },
  description: {
    type: "string",
    maxLength: 4000,
    description: "Ad description. Multiline text is supported.",
  },
  descriptionPrefix: {
    type: "string",
    description: "Optional ad-level description prefix.",
  },
  descriptionSuffix: {
    type: "string",
    description: "Optional ad-level description suffix.",
  },
  category: {
    type: "string",
    description: "Built-in category name, custom mapped category name, or category ID.",
  },
  specialAttributes: draftStringMapSchema,
  price: {
    type: "integer",
    minimum: 0,
    description: "Whole euro price. Required when priceType is FIXED.",
  },
  priceType: {
    type: "string",
    enum: ["FIXED", "NEGOTIABLE", "GIVE_AWAY", "NOT_APPLICABLE"],
    description: "Pricing mode. Defaults to NEGOTIABLE.",
  },
  shippingType: {
    type: "string",
    enum: ["PICKUP", "SHIPPING", "NOT_APPLICABLE"],
    description: "Shipping mode. Defaults to PICKUP for drafts.",
  },
  shippingCosts: {
    type: "number",
    minimum: 0,
    description: "Custom shipping cost.",
  },
  shippingOptions: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: {
      type: "string",
      enum: [
        "DHL_2",
        "Hermes_Päckchen",
        "Hermes_S",
        "DHL_5",
        "Hermes_M",
        "DHL_10",
        "DHL_20",
        "DHL_31,5",
        "Hermes_L",
      ],
    },
    description: "Predefined package options. Use one size group.",
  },
  sellDirectly: {
    type: "boolean",
    description: "Enable direct purchase. Requires shipping settings.",
  },
  images: {
    type: "array",
    minItems: 1,
    maxItems: 24,
    items: { type: "string" },
    description: "Image glob patterns relative to the draft ad directory.",
  },
  contact: draftStringMapSchema,
  republicationInterval: {
    type: "integer",
    minimum: 1,
    description: "Days between republication cycles.",
  },
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

function toolErrorResult(error, operation, config, extra = {}) {
  const stderr = sanitizeText(
    error instanceof Error ? error.message : String(error),
    buildRedactions(config),
    2000,
  );
  return textResult({
    ok: false,
    operation,
    exitCode: null,
    signal: null,
    timedOut: false,
    ...extra,
    stdout: "",
    stderr,
  });
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
        return toolErrorResult(error, operation, this.config);
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
          return toolErrorResult(error, "list_ads", this.config, { needsUserAction: false });
        }
      },
    },
    config,
  );
}

function adSchemaTool(config) {
  return bindToolConfig(
    {
      name: "kleinanzeigen_ad_schema",
      label: "Kleinanzeigen Ad Schema",
      description:
        "Return a safe ad YAML schema and draft workflow for miniclaw ads.",
      parameters: objectSchema({}),
      async execute(_toolCallId) {
        return textResult(getKleinanzeigenAdSchema());
      },
    },
    config,
  );
}

function readAdTool(config) {
  return bindToolConfig(
    {
      name: "kleinanzeigen_read_ad",
      label: "Kleinanzeigen Read Ad",
      description:
        "Read one existing ad config under trusted adRoots with contact fields redacted by default.",
      parameters: objectSchema({
        adConfigPaths: singleAdConfigPathsSchema,
        adDirectories: singleAdDirectoriesSchema,
        includeContact: {
          type: "boolean",
          description: "Include contact fields instead of redacting them. Defaults to false.",
        },
      }),
      async execute(_toolCallId, params) {
        try {
          return textResult(await readKleinanzeigenAd(params ?? {}, this.config));
        } catch (error) {
          return toolErrorResult(error, "read_ad", this.config, { needsUserAction: false });
        }
      },
    },
    config,
  );
}

function imagesListTool(config) {
  return bindToolConfig(
    {
      name: "kleinanzeigen_images_list",
      label: "Kleinanzeigen Images List",
      description:
        "List image files and basic dimensions under one trusted adRoots directory.",
      parameters: objectSchema(
        {
          directory: {
            type: "string",
            description:
              "Directory to scan. Must be inside configured adRoots; relative paths use the first adRoot.",
          },
          maxDepth: {
            type: "integer",
            minimum: 0,
            maximum: 6,
            description: "Maximum directory recursion depth. Defaults to 2.",
          },
          maxResults: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            description: "Maximum images to return. Defaults to 100.",
          },
        },
        ["directory"],
      ),
      async execute(_toolCallId, params) {
        try {
          return textResult(await listKleinanzeigenImages(params ?? {}, this.config));
        } catch (error) {
          return toolErrorResult(error, "images_list", this.config, { needsUserAction: false });
        }
      },
    },
    config,
  );
}

function draftAdTool(config) {
  return bindToolConfig(
    {
      name: "kleinanzeigen_draft_ad",
      label: "Kleinanzeigen Draft Ad",
      description:
        "Create or replace a safe ad.yaml draft under trusted adRoots without publishing.",
      parameters: objectSchema(
        draftAdProperties,
        ["confirm", "directory", "title", "description", "category"],
      ),
      async execute(_toolCallId, params) {
        try {
          return textResult(await draftKleinanzeigenAd(params ?? {}, this.config));
        } catch (error) {
          return toolErrorResult(error, "draft_ad", this.config, { needsUserAction: false });
        }
      },
    },
    config,
  );
}

function setAdActiveTool(config) {
  return bindToolConfig(
    {
      name: "kleinanzeigen_set_ad_active",
      label: "Kleinanzeigen Set Ad Active",
      description:
        "Set the top-level active flag for one YAML ad config under trusted adRoots.",
      parameters: objectSchema(
        {
          confirm: confirmSchema,
          adConfigPaths: singleAdConfigPathsSchema,
          adDirectories: singleAdDirectoriesSchema,
          active: {
            type: "boolean",
            description: "Whether the selected ad is eligible for publish/update.",
          },
        },
        ["confirm", "active"],
      ),
      async execute(_toolCallId, params) {
        try {
          return textResult(await setKleinanzeigenAdActive(params ?? {}, this.config));
        } catch (error) {
          return toolErrorResult(error, "set_ad_active", this.config, {
            needsUserAction: false,
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
          return toolErrorResult(error, "browser_status", this.config, {
            needsUserAction: false,
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
        "Change only the local miniclaw browser config after explicit user confirmation.",
      parameters: objectSchema(
        {
          confirm: confirmSchema,
          browser: browserSchema,
          usePrivateWindow: {
            type: "boolean",
            description: "Whether miniclaw should launch a private or incognito browser window.",
          },
          profileMode: configurableProfileModeSchema,
          profileName: {
            type: "string",
            description:
              "Optional browser profile directory name for profileMode system-default.",
          },
        },
        ["confirm"],
      ),
      async execute(_toolCallId, params) {
        try {
          return textResult(await configureKleinanzeigenBrowser(params ?? {}, this.config));
        } catch (error) {
          return toolErrorResult(error, "browser_configure", this.config, {
            needsUserAction: false,
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
        "Run miniclaw browser diagnostics against current or temporary browser settings.",
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
            "Allow binaryLocation to point at a custom browser that miniclaw does not officially support.",
        },
      }),
      async execute(_toolCallId, params) {
        try {
          return textResult(await checkKleinanzeigenBrowser(params ?? {}, this.config));
        } catch (error) {
          return toolErrorResult(error, "browser_check", this.config, {
            needsUserAction: false,
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
          "Check embedded miniclaw availability and config wiring without reading the config.",
        parameters: objectSchema({}),
        async execute(_toolCallId) {
          try {
            return textResult(await getKleinanzeigenStatus(this.config));
          } catch (error) {
            return toolErrorResult(error, "status", this.config, {
              needsUserAction: false,
            });
          }
        },
      },
      config,
    ),
    listAdsTool(config),
    adSchemaTool(config),
    readAdTool(config),
    imagesListTool(config),
    browserStatusTool(config),
    browserCheckTool(config),
    browserConfigureTool(config),
    draftAdTool(config),
    setAdActiveTool(config),
    bindToolConfig(
      operationTool({
        name: "kleinanzeigen_verify",
        label: "Kleinanzeigen Verify",
        description:
          "Verify the configured local miniclaw setup and return sanitized output.",
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
          "Publish or republish configured ads via miniclaw after explicit user confirmation.",
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
          "Update configured ads via miniclaw after explicit user confirmation.",
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
          "Delete explicitly selected Kleinanzeigen ads via miniclaw after confirmation.",
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
          "Download configured ads via miniclaw after explicit user confirmation.",
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
          "Extend eligible configured ads via miniclaw after explicit user confirmation.",
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
