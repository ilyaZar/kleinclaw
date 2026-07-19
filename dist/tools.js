import { checkKleinanzeigenBrowser, configureKleinanzeigenBrowser, draftKleinanzeigenAd, getKleinanzeigenAdSchema, getKleinanzeigenBrowserStatus, listKleinanzeigenImages, listKleinanzeigenAds, readKleinanzeigenAd, runKleinanzeigenOperation, setKleinanzeigenAdActive, } from "./cli.js";
import { getKleinanzeigenStatus } from "./miniclaw-runtime.js";
import { buildRedactions, sanitizeText, } from "./process-boundary.js";
export { buildKleinanzeigenApprovalDescription } from "./tool-approval.js";
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
export function resolveApprovalToolNames(tools, config = {}) {
    const mode = typeof config.approvalMode === "string"
        ? config.approvalMode
        : "all";
    if (mode === "none") {
        return new Set();
    }
    if (mode === "mutating") {
        return new Set(SIDE_EFFECT_TOOL_NAMES);
    }
    return new Set(tools.map((tool) => tool.name));
}
function field(type, description, constraints = {}) {
    return { type, ...constraints, description };
}
function arrayField(description, maxItems, items) {
    return { type: "array", minItems: 1, maxItems, items, description };
}
const adIdsSchema = arrayField("Explicit numeric Kleinanzeigen ad IDs.", 50, { type: "string", pattern: "^[0-9]+$" });
const adConfigPathsSchema = arrayField("Explicit ad YAML/JSON files to scope this operation to. " +
    "Paths must be inside configured adRoots.", 20, { type: "string" });
const adDirectoriesSchema = arrayField("Directories containing ad.yaml, ad.yml, or ad.json to scope this " +
    "operation to. Paths must be inside configured adRoots.", 20, { type: "string" });
const singleAdScopeProperties = {
    adConfigPaths: { ...adConfigPathsSchema, maxItems: 1 },
    adDirectories: { ...adDirectoriesSchema, maxItems: 1 },
};
const adConfigScopeProperties = {
    adConfigPaths: adConfigPathsSchema,
    adDirectories: adDirectoriesSchema,
};
const adOperationScopeProperties = {
    adIds: adIdsSchema,
    ...adConfigScopeProperties,
};
const confirmSchema = field("boolean", "Must be true only after the user explicitly confirms this operation.", { const: true });
const browserSchema = field("string", "Browser to write into browser.binary_location. Auto clears the value " +
    "and uses miniclaw detection.", { enum: ["auto", "chromium", "google-chrome", "microsoft-edge"] });
const profileModeSchema = field("string", "workspace clears profile settings, system-default uses the chosen " +
    "browser's normal profile root, custom uses userDataDir.", { enum: ["workspace", "system-default", "custom"] });
const configurableProfileModeSchema = field("string", "workspace clears profile settings, system-default uses the chosen " +
    "browser's normal profile root.", { enum: ["workspace", "system-default"] });
const draftStringMapSchema = {
    type: "object",
    additionalProperties: { type: "string" },
};
const draftAdProperties = {
    confirm: confirmSchema,
    directory: field("string", "Target draft directory inside configured adRoots. Relative paths " +
        "resolve under the first adRoot."),
    fileName: field("string", "Draft file name. Defaults to ad.yaml.", { enum: ["ad.yaml", "ad.yml"] }),
    overwrite: field("boolean", "Replace an existing draft file. Defaults to false."),
    active: field("boolean", "Whether the ad is eligible for publish. Defaults to false for safe drafts."),
    type: field("string", "Listing type. Defaults to OFFER.", { enum: ["OFFER", "WANTED"] }),
    title: field("string", "Kleinanzeigen title.", { minLength: 10, maxLength: 65 }),
    description: field("string", "Ad description. Multiline text is supported.", { maxLength: 4000 }),
    descriptionPrefix: field("string", "Optional ad-level description prefix."),
    descriptionSuffix: field("string", "Optional ad-level description suffix."),
    category: field("string", "Built-in category name, custom mapped category name, or category ID."),
    specialAttributes: draftStringMapSchema,
    price: field("integer", "Whole euro price. Required when priceType is FIXED.", { minimum: 0 }),
    priceType: field("string", "Pricing mode. Defaults to NEGOTIABLE.", { enum: ["FIXED", "NEGOTIABLE", "GIVE_AWAY", "NOT_APPLICABLE"] }),
    shippingType: field("string", "Shipping mode. Defaults to PICKUP for drafts.", { enum: ["PICKUP", "SHIPPING", "NOT_APPLICABLE"] }),
    shippingCosts: field("number", "Custom shipping cost.", { minimum: 0 }),
    shippingOptions: arrayField("Predefined package options. Use one size group.", 8, {
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
    }),
    sellDirectly: field("boolean", "Enable direct purchase. Requires shipping settings."),
    images: arrayField("Image glob patterns relative to the draft ad directory.", 24, { type: "string" }),
    contact: draftStringMapSchema,
    republicationInterval: field("integer", "Days between republication cycles.", { minimum: 1 }),
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
function errorTextResult(error, operation, config) {
    const stderr = sanitizeText(error instanceof Error ? error.message : String(error), buildRedactions(config), 2000);
    const payload = {
        ok: false,
        operation,
        exitCode: null,
        signal: null,
        timedOut: false,
        needsUserAction: false,
    };
    return textResult({
        ...payload,
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
function handledTool(config, { operation, handler, ...tool }) {
    return {
        ...tool,
        name: `kleinanzeigen_${operation}`,
        label: `Kleinanzeigen ${tool.label}`,
        async execute(_toolCallId, params = {}) {
            try {
                return textResult(await handler(config, params));
            }
            catch (error) {
                return errorTextResult(error, operation, config);
            }
        },
    };
}
function operationTool(config, definition) {
    return handledTool(config, {
        ...definition,
        handler: (toolConfig, params) => runKleinanzeigenOperation(definition.operation, params, toolConfig),
    });
}
function operationSelectorSchema(values, defaultValue) {
    return {
        type: "string",
        enum: values,
        description: `Configured ad selector. Defaults to ${defaultValue}.`,
    };
}
function adOperationSchema(properties = {}, required = ["confirm"]) {
    return objectSchema({
        confirm: confirmSchema,
        ...properties,
        ...adOperationScopeProperties,
    }, required);
}
function defineTool(definition) {
    return (config) => handledTool(config, definition);
}
const statusTool = defineTool({
    label: "Status",
    description: "Check embedded miniclaw availability and config wiring without reading the config.",
    parameters: objectSchema({}),
    operation: "status",
    handler: (toolConfig) => getKleinanzeigenStatus(toolConfig),
});
const listAdsTool = defineTool({
    label: "List Ads",
    description: "List configured local ad folders under trusted adRoots without publishing anything.",
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
    operation: "list_ads",
    handler: (toolConfig, params) => listKleinanzeigenAds(toolConfig, params),
});
const adSchemaTool = defineTool({
    label: "Ad Schema",
    description: "Return a safe ad YAML schema and draft workflow for miniclaw ads.",
    parameters: objectSchema({}),
    operation: "ad_schema",
    handler: () => getKleinanzeigenAdSchema(),
});
const readAdTool = defineTool({
    label: "Read Ad",
    description: "Read one existing ad config under trusted adRoots with contact fields redacted by default.",
    parameters: objectSchema({
        ...singleAdScopeProperties,
        includeContact: field("boolean", "Include contact fields instead of redacting them. Defaults to false."),
    }),
    operation: "read_ad",
    handler: (toolConfig, params) => readKleinanzeigenAd(params, toolConfig),
});
const imagesListTool = defineTool({
    label: "Images List",
    description: "List image files and basic dimensions under one trusted adRoots directory.",
    parameters: objectSchema({
        directory: {
            type: "string",
            description: "Directory to scan. Must be inside configured adRoots; relative paths use the first adRoot.",
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
    }, ["directory"]),
    operation: "images_list",
    handler: (toolConfig, params) => listKleinanzeigenImages(params, toolConfig),
});
const draftAdTool = defineTool({
    label: "Draft Ad",
    description: "Create or replace a safe ad.yaml draft under trusted adRoots without publishing.",
    parameters: objectSchema(draftAdProperties, ["confirm", "directory", "title", "description", "category"]),
    operation: "draft_ad",
    handler: (toolConfig, params) => draftKleinanzeigenAd(params, toolConfig),
});
const setAdActiveTool = defineTool({
    label: "Set Ad Active",
    description: "Set the top-level active flag for one YAML ad config under trusted adRoots.",
    parameters: objectSchema({
        confirm: confirmSchema,
        ...singleAdScopeProperties,
        active: field("boolean", "Whether the selected ad is eligible for publish/update."),
    }, ["confirm", "active"]),
    operation: "set_ad_active",
    handler: (toolConfig, params) => setKleinanzeigenAdActive(params, toolConfig),
});
const browserStatusTool = defineTool({
    label: "Browser Status",
    description: "Read the non-secret browser section and detected local browser binaries.",
    parameters: objectSchema({}),
    operation: "browser_status",
    handler: (toolConfig) => getKleinanzeigenBrowserStatus(toolConfig),
});
const browserConfigureTool = defineTool({
    label: "Browser Configure",
    description: "Change only the local miniclaw browser config after explicit user confirmation.",
    parameters: objectSchema({
        confirm: confirmSchema,
        browser: browserSchema,
        usePrivateWindow: field("boolean", "Whether miniclaw should launch a private or incognito browser window."),
        profileMode: configurableProfileModeSchema,
        profileName: field("string", "Optional browser profile directory name for profileMode system-default."),
    }, ["confirm"]),
    operation: "browser_configure",
    handler: (toolConfig, params) => configureKleinanzeigenBrowser(params, toolConfig),
});
const browserCheckTool = defineTool({
    label: "Browser Check",
    description: "Run miniclaw browser diagnostics against current or temporary browser settings.",
    parameters: objectSchema({
        browser: browserSchema,
        binaryLocation: field("string", "Explicit executable path. Use browser for known installed browsers when possible."),
        usePrivateWindow: field("boolean", "Whether the checked config should use a private or incognito window."),
        profileMode: profileModeSchema,
        userDataDir: field("string", "Browser user data directory. Required when profileMode is custom."),
        profileName: field("string", "Optional browser profile directory name, such as Default or Profile 1."),
        allowUnsupportedBrowser: field("boolean", "Allow binaryLocation to point at a custom browser that miniclaw does " +
            "not officially support."),
    }),
    operation: "browser_check",
    handler: (toolConfig, params) => checkKleinanzeigenBrowser(params, toolConfig),
});
export function createKleinanzeigenTools(config = {}) {
    return [
        statusTool(config),
        listAdsTool(config),
        adSchemaTool(config),
        readAdTool(config),
        imagesListTool(config),
        browserStatusTool(config),
        browserCheckTool(config),
        browserConfigureTool(config),
        draftAdTool(config),
        setAdActiveTool(config),
        operationTool(config, {
            label: "Verify",
            description: "Verify the configured local miniclaw setup and return sanitized output.",
            operation: "verify",
            parameters: objectSchema(adConfigScopeProperties),
        }),
        operationTool(config, {
            label: "Publish",
            description: "Publish or republish configured ads via miniclaw after explicit user confirmation.",
            operation: "publish",
            parameters: adOperationSchema({
                selector: operationSelectorSchema(["due", "new", "changed", "all"], "due"),
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
                keepOld: {
                    type: "boolean",
                    description: "Keep old ads during republication.",
                },
            }),
        }),
        operationTool(config, {
            label: "Update",
            description: "Update configured ads via miniclaw after explicit user confirmation.",
            operation: "update",
            parameters: adOperationSchema({
                selector: operationSelectorSchema(["changed", "all"], "changed"),
            }),
        }),
        operationTool(config, {
            label: "Delete",
            description: "Delete explicitly selected Kleinanzeigen ads via miniclaw after confirmation.",
            operation: "delete",
            parameters: adOperationSchema({}, ["confirm", "adIds"]),
        }),
        operationTool(config, {
            label: "Download",
            description: "Download configured ads via miniclaw after explicit user confirmation.",
            operation: "download",
            parameters: adOperationSchema({
                selector: operationSelectorSchema(["new", "all"], "new"),
            }),
        }),
        operationTool(config, {
            label: "Extend",
            description: "Extend eligible configured ads via miniclaw after explicit user confirmation.",
            operation: "extend",
            parameters: adOperationSchema({
                selector: operationSelectorSchema(["all"], "all"),
            }),
        }),
    ];
}
