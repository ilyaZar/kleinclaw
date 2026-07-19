export function normalizeOptionalString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
export function normalizeWorkspaceMode(value) {
    const mode = normalizeOptionalString(value) ?? "portable";
    if (mode !== "portable" && mode !== "xdg") {
        throw new Error("workspaceMode must be portable or xdg");
    }
    return mode;
}
export function normalizePositiveInteger(value, fallback, min, max) {
    if (!Number.isInteger(value)) {
        return fallback;
    }
    return Math.min(Math.max(Number(value), min), max);
}
