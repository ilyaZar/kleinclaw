import { quoteYamlScalar } from "./cli-yaml-text.js";
function snakeCaseKey(key) {
    return String(key).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
function yamlScalar(value, indent = 0) {
    const pad = " ".repeat(indent);
    if (typeof value === "boolean" || typeof value === "number") {
        return `${value}`;
    }
    if (value === null) {
        return "";
    }
    const text = String(value ?? "");
    if (text.includes("\n")) {
        const lines = text.split("\n");
        return `|\n${lines.map((line) => `${pad}  ${line}`).join("\n")}`;
    }
    return quoteYamlScalar(text);
}
function yamlLinesForEntry(key, value, indent = 0) {
    const pad = " ".repeat(indent);
    if (Array.isArray(value)) {
        if (!value.length) {
            return [`${pad}${key}: []`];
        }
        return [
            `${pad}${key}:`,
            ...value.map((entry) => `${pad}  - ${yamlScalar(entry, indent + 2)}`),
        ];
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
        if (!entries.length) {
            return [`${pad}${key}: {}`];
        }
        return [
            `${pad}${key}:`,
            ...entries.flatMap(([childKey, entry]) => yamlLinesForEntry(snakeCaseKey(childKey), entry, indent + 2)),
        ];
    }
    return [`${pad}${key}: ${yamlScalar(value, indent)}`];
}
export function renderAdYaml(ad) {
    const schemaRef = "miniclaw://schemas/ad.schema.json";
    const order = [
        "active",
        "type",
        "title",
        "description",
        "descriptionPrefix",
        "descriptionSuffix",
        "category",
        "specialAttributes",
        "price",
        "priceType",
        "shippingType",
        "shippingCosts",
        "shippingOptions",
        "sellDirectly",
        "images",
        "contact",
        "republicationInterval",
    ];
    const lines = [
        `# yaml-language-server: $schema=${schemaRef}`,
    ];
    for (const key of order) {
        if (ad[key] !== undefined) {
            lines.push(...yamlLinesForEntry(snakeCaseKey(key), ad[key]));
        }
    }
    return `${lines.join("\n")}\n`;
}
export function sanitizeAdYaml(text, { includeContact = false } = {}) {
    const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
    const sanitized = [];
    let inContact = false;
    for (const line of lines) {
        if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(line)) {
            inContact = /^contact\s*:/.test(line);
            sanitized.push(line);
            continue;
        }
        if (!includeContact && inContact && /^\s+[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(line)) {
            sanitized.push(line.replace(/:\s*.*$/, ": [redacted-contact]"));
            continue;
        }
        sanitized.push(line);
    }
    return sanitized.join("\n").trim();
}
export function setYamlTopLevelActive(text, active) {
    const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
    const nextLine = `active: ${active ? "true" : "false"}`;
    const activeIndex = lines.findIndex((line) => /^active\s*:/.test(line));
    if (activeIndex !== -1) {
        const next = [...lines];
        next[activeIndex] = nextLine;
        return next.join("\n");
    }
    let insertAt = 0;
    while (insertAt < lines.length &&
        (lines[insertAt].trim() === "" || lines[insertAt].trimStart().startsWith("#"))) {
        insertAt += 1;
    }
    const next = [...lines];
    next.splice(insertAt, 0, nextLine);
    return next.join("\n");
}
