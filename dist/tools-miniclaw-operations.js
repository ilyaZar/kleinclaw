import { runKleinanzeigenOperation } from "./cli.js";
import { handledTool, } from "./tools-execution.js";
import { adConfigScopeProperties, adOperationSchema, objectSchema, operationSelectorSchema, } from "./tools-schemas.js";
function operationTool(config, definition) {
    return handledTool(config, {
        ...definition,
        handler: (toolConfig, params) => runKleinanzeigenOperation(definition.operation, params, toolConfig),
    });
}
export function createMiniclawOperationTools(config) {
    return [
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
