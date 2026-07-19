import path from "node:path";

type Config = Record<string, unknown>;
type Params = Record<string, unknown>;

function relativeConfiguredPath(value: unknown, config: Config): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const raw = value.trim();
  const resolved = path.resolve(raw);
  const roots = Array.isArray(config.adRoots) ? config.adRoots : [];
  for (const root of roots) {
    if (typeof root !== "string" || !root.trim()) {
      continue;
    }
    const rootResolved = path.resolve(root);
    const relative = path.relative(rootResolved, resolved);
    if (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    ) {
      return relative || path.basename(rootResolved);
    }
  }
  return path.isAbsolute(raw)
    ? `[redacted-path]/${path.basename(resolved)}`
    : raw;
}

function truncateText(value: string, max = 256): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function appendScalar(
  lines: string[],
  label: string,
  value: unknown,
  max = 44,
  separator = ": ",
): void {
  if (typeof value !== "string" && typeof value !== "boolean") {
    return;
  }
  const text = typeof value === "string" ? truncateText(value, max) : value;
  lines.push(`${label}${separator}${text}`);
}

function summarizeList(
  values: unknown[],
  config: Config,
  max = 48,
): string | null {
  if (!values.length) {
    return null;
  }
  return truncateText(
    values
      .map((value) => relativeConfiguredPath(value, config))
      .filter((value): value is string => Boolean(value))
      .join(", "),
    max,
  );
}

export function buildKleinanzeigenApprovalDescription({
  toolName,
  params = {},
  config = {},
}: {
  toolName: string;
  params?: Params;
  config?: Config;
}): string {
  const operation = toolName.replace(/^kleinanzeigen_/, "");
  const lines = [
    "Always allow trusts all KleinClaw tools until changed.",
    `Operation: ${operation}`,
  ];

  appendScalar(lines, "Include contact", params.includeContact);
  appendScalar(lines, "Keep old ads", params.keepOld);
  appendScalar(lines, "Selector", params.selector);
  const selectors = Array.isArray(params.selectors) ? params.selectors : [];
  if (selectors.length) {
    lines.push(`Selectors: ${truncateText(selectors.join(", "), 44)}`);
  }
  const adPaths = [
    ...(Array.isArray(params.adDirectories) ? params.adDirectories : []),
    ...(Array.isArray(params.adConfigPaths) ? params.adConfigPaths : []),
  ];
  const summarizedAdPaths = summarizeList(adPaths, config);
  if (summarizedAdPaths) {
    lines.push(`Ad paths (${adPaths.length}): ${summarizedAdPaths}`);
  }
  const adIds = Array.isArray(params.adIds) ? params.adIds : [];
  if (adIds.length) {
    lines.push(`Ad IDs (${adIds.length}): ${truncateText(adIds.join(", "), 44)}`);
  }
  if (typeof params.directory === "string") {
    const directory = relativeConfiguredPath(params.directory, config) ?? "";
    lines.push(`Directory: ${truncateText(directory, 44)}`);
  }
  if (
    ["verify", "publish", "update", "download", "extend"].includes(operation) &&
    !adPaths.length &&
    !adIds.length
  ) {
    lines.push("Scope: miniclaw config default selection");
  }

  if (operation === "browser_configure" || operation === "browser_check") {
    const settings: string[] = [];
    appendScalar(settings, "browser", params.browser, 16, "=");
    appendScalar(settings, "private", params.usePrivateWindow, 16, "=");
    appendScalar(settings, "mode", params.profileMode, 16, "=");
    appendScalar(
      settings,
      "unsupported",
      params.allowUnsupportedBrowser,
      16,
      "=",
    );
    appendScalar(
      settings,
      "profile",
      params.profileName === "" ? "(default)" : params.profileName,
      16,
      "=",
    );
    if (settings.length) {
      lines.push(`Browser: ${settings.join(", ")}`);
    }
    if (typeof params.binaryLocation === "string") {
      const binary = relativeConfiguredPath(params.binaryLocation, config) ?? "";
      lines.push(`Binary: ${truncateText(binary, 28)}`);
    }
    if (typeof params.userDataDir === "string") {
      const dataDir = relativeConfiguredPath(params.userDataDir, config) ?? "";
      lines.push(`Data dir: ${truncateText(dataDir, 28)}`);
    }
  } else if (operation === "draft_ad") {
    appendScalar(lines, "Draft file", params.fileName);
    appendScalar(lines, "Active", params.active);
    appendScalar(lines, "Overwrite", params.overwrite);
    appendScalar(lines, "Title", params.title);
    appendScalar(lines, "Category", params.category);
  } else if (operation === "set_ad_active") {
    appendScalar(lines, "Active", params.active);
  }

  return truncateText(lines.join("\n"));
}
