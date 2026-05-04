import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  buildKleinanzeigenApprovalDescription,
  createKleinanzeigenTools,
  OPTIONAL_TOOL_NAMES,
  resolveApprovalToolNames,
} from "./src/tools.js";

export default definePluginEntry({
  id: "kleinclaw",
  name: "KleinClaw",
  description:
    "Kleinanzeigen helper tools for a local kleinanzeigen-bot setup with redacted output.",
  register(api) {
    const pluginConfig = api.pluginConfig ?? {};
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
});
