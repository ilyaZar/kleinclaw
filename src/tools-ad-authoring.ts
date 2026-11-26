import {
  draftKleinanzeigenAd, setKleinanzeigenAdActive,
} from "./cli.js";
import {
  type Config, handledTool, type KleinanzeigenTool,
} from "./tools-execution.js";
import {
  confirmSchema, draftAdProperties, field, objectSchema, singleAdScopeProperties,
} from "./tools-schemas.js";

export function createAdAuthoringTools(config: Config): KleinanzeigenTool[] {
  return [
    handledTool(config, {
      label: "Draft Ad",
      description:
        "Create or replace a safe ad.yaml draft under trusted adRoots without publishing.",
      parameters: objectSchema(
        draftAdProperties,
        ["confirm", "directory", "title", "description", "category"],
      ),
      operation: "draft_ad",
      handler: (toolConfig, params) => draftKleinanzeigenAd(params, toolConfig),
    }),
    handledTool(config, {
      label: "Set Ad Active",
      description:
        "Set the top-level active flag for one YAML ad config under trusted adRoots.",
      parameters: objectSchema(
        {
          confirm: confirmSchema,
          ...singleAdScopeProperties,
          active: field(
            "boolean",
            "Whether the selected ad is eligible for publish/update.",
          ),
        },
        ["confirm", "active"],
      ),
      operation: "set_ad_active",
      handler: (toolConfig, params) =>
        setKleinanzeigenAdActive(params, toolConfig),
    }),
  ];
}
