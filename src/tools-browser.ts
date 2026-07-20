import {
  checkKleinanzeigenBrowser, configureKleinanzeigenBrowser,
  getKleinanzeigenBrowserStatus,
} from "./cli.js";
import {
  type Config, handledTool, type KleinanzeigenTool,
} from "./tools-execution.js";
import {
  browserSchema, configurableProfileModeSchema, confirmSchema, field,
  objectSchema, profileModeSchema,
} from "./tools-schemas.js";

export function createBrowserTools(config: Config): KleinanzeigenTool[] {
  return [
    handledTool(config, {
      label: "Browser Status",
      description:
        "Read the non-secret browser section and detected local browser binaries.",
      parameters: objectSchema({}),
      operation: "browser_status",
      handler: (toolConfig) => getKleinanzeigenBrowserStatus(toolConfig),
    }),
    handledTool(config, {
      label: "Browser Check",
      description:
        "Run miniclaw browser diagnostics against current or temporary browser settings.",
      parameters: objectSchema({
        browser: browserSchema,
        binaryLocation: field(
          "string",
          "Explicit executable path. Use browser for known installed browsers when possible.",
        ),
        usePrivateWindow: field(
          "boolean",
          "Whether the checked config should use a private or incognito window.",
        ),
        profileMode: profileModeSchema,
        userDataDir: field(
          "string",
          "Browser user data directory. Required when profileMode is custom.",
        ),
        profileName: field(
          "string",
          "Optional browser profile directory name, such as Default or Profile 1.",
        ),
        allowUnsupportedBrowser: field(
          "boolean",
          "Allow binaryLocation to point at a custom browser that miniclaw does " +
            "not officially support.",
        ),
      }),
      operation: "browser_check",
      handler: (toolConfig, params) => checkKleinanzeigenBrowser(params, toolConfig),
    }),
    handledTool(config, {
      label: "Browser Configure",
      description:
        "Change only the local miniclaw browser config after explicit user confirmation.",
      parameters: objectSchema(
        {
          confirm: confirmSchema,
          browser: browserSchema,
          usePrivateWindow: field(
            "boolean",
            "Whether miniclaw should launch a private or incognito browser window.",
          ),
          profileMode: configurableProfileModeSchema,
          profileName: field(
            "string",
            "Optional browser profile directory name for profileMode system-default.",
          ),
        },
        ["confirm"],
      ),
      operation: "browser_configure",
      handler: (toolConfig, params) =>
        configureKleinanzeigenBrowser(params, toolConfig),
    }),
  ];
}
