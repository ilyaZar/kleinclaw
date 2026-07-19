export function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeWorkspaceMode(value: unknown): "portable" | "xdg" {
  const mode = normalizeOptionalString(value) ?? "portable";
  if (mode !== "portable" && mode !== "xdg") {
    throw new Error("workspaceMode must be portable or xdg");
  }
  return mode;
}

export function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value)) {
    return fallback;
  }
  return Math.min(Math.max(Number(value), min), max);
}
