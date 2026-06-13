import {
  buildKleinanzeigenApprovalDescription,
  createKleinanzeigenTools,
  OPTIONAL_TOOL_NAMES,
  resolveApprovalToolNames,
} from "./tools.js";

export function createCommandRunner(runtime) {
  const runCommandWithTimeout = runtime?.system?.runCommandWithTimeout;
  if (typeof runCommandWithTimeout !== "function") {
    return undefined;
  }

  return (argv, options = {}) =>
    runCommandWithTimeout(argv, {
      cwd: options.cwd,
      env: options.env,
      timeoutMs: options.timeoutMs ?? 120000,
    });
}

export function createKleinClawPluginEntry() {
  return {
    id: "kleinclaw",
    name: "KleinClaw",
    description:
      "Kleinanzeigen tools that can change live listings, edit local browser " +
      "settings, and run the embedded miniclaw browser runtime with redacted output.",
    register(api) {
      const pluginConfig = {
        ...(api.pluginConfig ?? {}),
        commandRunner: createCommandRunner(api.runtime),
      };
      const tools = createKleinanzeigenTools(pluginConfig);
      const approvalToolNames = resolveApprovalToolNames(pluginConfig);

      for (const tool of tools) {
        api.registerTool(
          tool,
          OPTIONAL_TOOL_NAMES.has(tool.name) ? { optional: true } : undefined,
        );
      }

      api.on(
        "before_tool_call",
        (event) => {
          if (!approvalToolNames.has(event.toolName)) {
            return;
          }

          return {
            requireApproval: {
              title: "Run Kleinanzeigen local operation",
              description: buildKleinanzeigenApprovalDescription({
                toolName: event.toolName,
                params: event.params,
                config: pluginConfig,
              }),
              severity: "warning",
              timeoutMs: 120000,
              timeoutBehavior: "deny",
            },
          };
        },
        { priority: 80, timeoutMs: 5000 },
      );
    },
  };
}
