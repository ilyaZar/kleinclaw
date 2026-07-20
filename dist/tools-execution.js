import { buildRedactions, sanitizeText, } from "./process-boundary.js";
function textResult(payload) {
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
    return textResult({ ...payload, stdout: "", stderr });
}
export function handledTool(config, { operation, handler, ...tool }) {
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
