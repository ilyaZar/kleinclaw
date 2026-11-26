import { getKleinanzeigenAdSchema, listKleinanzeigenAds, listKleinanzeigenImages, readKleinanzeigenAd, } from "./cli.js";
import { getKleinanzeigenStatus } from "./miniclaw-runtime.js";
import { handledTool, } from "./tools-execution.js";
import { field, objectSchema, singleAdScopeProperties, } from "./tools-schemas.js";
export function createReadAdsTools(config) {
    return [
        handledTool(config, {
            label: "Status",
            description: "Check embedded miniclaw availability and config wiring without reading the config.",
            parameters: objectSchema({}),
            operation: "status",
            handler: (toolConfig) => getKleinanzeigenStatus(toolConfig),
        }),
        handledTool(config, {
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
        }),
        handledTool(config, {
            label: "Ad Schema",
            description: "Return a safe ad YAML schema and draft workflow for miniclaw ads.",
            parameters: objectSchema({}),
            operation: "ad_schema",
            handler: () => getKleinanzeigenAdSchema(),
        }),
        handledTool(config, {
            label: "Read Ad",
            description: "Read one existing ad config under trusted adRoots with contact fields redacted by default.",
            parameters: objectSchema({
                ...singleAdScopeProperties,
                includeContact: field("boolean", "Include contact fields instead of redacting them. Defaults to false."),
            }),
            operation: "read_ad",
            handler: (toolConfig, params) => readKleinanzeigenAd(params, toolConfig),
        }),
        handledTool(config, {
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
        }),
    ];
}
