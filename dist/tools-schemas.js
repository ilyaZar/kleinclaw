export function field(type, description, constraints = {}) {
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
export const singleAdScopeProperties = {
    adConfigPaths: { ...adConfigPathsSchema, maxItems: 1 },
    adDirectories: { ...adDirectoriesSchema, maxItems: 1 },
};
export const adConfigScopeProperties = {
    adConfigPaths: adConfigPathsSchema,
    adDirectories: adDirectoriesSchema,
};
const adOperationScopeProperties = {
    adIds: adIdsSchema,
    ...adConfigScopeProperties,
};
export const confirmSchema = field("boolean", "Must be true only after the user explicitly confirms this operation.", { const: true });
export const browserSchema = field("string", "Browser to write into browser.binary_location. Auto clears the value " +
    "and uses miniclaw detection.", { enum: ["auto", "chromium", "google-chrome", "microsoft-edge"] });
export const profileModeSchema = field("string", "workspace clears profile settings, system-default uses the chosen " +
    "browser's normal profile root, custom uses userDataDir.", { enum: ["workspace", "system-default", "custom"] });
export const configurableProfileModeSchema = field("string", "workspace clears profile settings, system-default uses the chosen " +
    "browser's normal profile root.", { enum: ["workspace", "system-default"] });
const draftStringMapSchema = {
    type: "object",
    additionalProperties: { type: "string" },
};
export const draftAdProperties = {
    confirm: confirmSchema,
    directory: field("string", "Target draft directory inside configured adRoots. Relative paths " +
        "resolve under the first adRoot."),
    fileName: field("string", "Draft file name. Defaults to ad.yaml.", {
        enum: ["ad.yaml", "ad.yml"],
    }),
    overwrite: field("boolean", "Replace an existing draft file. Defaults to false."),
    active: field("boolean", "Whether the ad is eligible for publish. Defaults to false for safe drafts."),
    type: field("string", "Listing type. Defaults to OFFER.", {
        enum: ["OFFER", "WANTED"],
    }),
    title: field("string", "Kleinanzeigen title.", {
        minLength: 10, maxLength: 65,
    }),
    description: field("string", "Ad description. Multiline text is supported.", { maxLength: 4000 }),
    descriptionPrefix: field("string", "Optional ad-level description prefix."),
    descriptionSuffix: field("string", "Optional ad-level description suffix."),
    category: field("string", "Built-in category name, custom mapped category name, or category ID."),
    specialAttributes: draftStringMapSchema,
    price: field("integer", "Whole euro price. Required when priceType is FIXED.", { minimum: 0 }),
    priceType: field("string", "Pricing mode. Defaults to NEGOTIABLE.", {
        enum: ["FIXED", "NEGOTIABLE", "GIVE_AWAY", "NOT_APPLICABLE"],
    }),
    shippingType: field("string", "Shipping mode. Defaults to PICKUP for drafts.", {
        enum: ["PICKUP", "SHIPPING", "NOT_APPLICABLE"],
    }),
    shippingCosts: field("number", "Custom shipping cost.", { minimum: 0 }),
    shippingOptions: arrayField("Predefined package options. Use one size group.", 8, {
        type: "string",
        enum: [
            "DHL_2", "Hermes_Päckchen", "Hermes_S", "DHL_5", "Hermes_M",
            "DHL_10", "DHL_20", "DHL_31,5", "Hermes_L",
        ],
    }),
    sellDirectly: field("boolean", "Enable direct purchase. Requires shipping settings."),
    images: arrayField("Image glob patterns relative to the draft ad directory.", 24, { type: "string" }),
    contact: draftStringMapSchema,
    republicationInterval: field("integer", "Days between republication cycles.", { minimum: 1 }),
};
export function objectSchema(properties, required = []) {
    return {
        type: "object",
        additionalProperties: false,
        properties,
        ...(required.length ? { required } : {}),
    };
}
export function operationSelectorSchema(values, defaultValue) {
    return {
        type: "string",
        enum: values,
        description: `Configured ad selector. Defaults to ${defaultValue}.`,
    };
}
export function adOperationSchema(properties = {}, required = ["confirm"]) {
    return objectSchema({ confirm: confirmSchema, ...properties, ...adOperationScopeProperties }, required);
}
