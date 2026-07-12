import {
  buildKleinanzeigenApprovalDescription,
  createKleinanzeigenTools,
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
      const approvalToolNames = resolveApprovalToolNames(tools, pluginConfig);

      for (const tool of tools) {
        api.registerTool(tool);
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
              async onResolution(decision) {
                if (decision !== "allow-always") {
                  return;
                }
                await api.runtime.config.mutateConfigFile({
                  afterWrite: {
                    mode: "none",
                    reason: "KleinClaw updates the in-process approval gate",
                  },
                  mutate(draft) {
                    const plugins = (draft.plugins ??= {});
                    const entries = (plugins.entries ??= {});
                    const entry = (entries.kleinclaw ??= {});
                    const config = (entry.config ??= {});
                    config.approvalMode = "none";
                  },
                });
                approvalToolNames.clear();
              },
            },
          };
        },
        { priority: 80, timeoutMs: 5000 },
      );
    },
  };
}
