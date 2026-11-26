import fs from "node:fs/promises";
import path from "node:path";

import {
  displayPathForAd, parseAdSummary, resolveAdIdScopedAdConfigPaths,
} from "./cli-ad-catalog.js";
import { pathIsInside, realPath, resolveAdConfigPathEntry } from "./cli-ad-paths.js";
import {
  buildKleinanzeigenArgs, normalizeStringArray, requireConfirmed,
} from "./cli-operation-arguments.js";
import {
  assertConfiguredFiles, invokeMiniclaw, resolveCliConfig,
} from "./miniclaw-runtime.js";
import { redactArgs } from "./process-boundary.js";

function buildOperationOutcome(operation, parsed) {
  if (!parsed.ok) {
    return {
      success: false,
      status: "protocol_error",
      summary: "miniclaw returned invalid structured output",
    };
  }
  const { counts, status } = parsed.result;
  const success = status === "succeeded" || status === "no_op";
  return {
    success,
    status,
    summary: status === "no_op"
      ? "miniclaw completed successfully with no matching ads to change"
      : status === "succeeded"
      ? `${operation} completed successfully`
      : status === "partial_failure"
      ? `${operation} completed with failed items`
      : `${operation} failed`,
    ...(counts ? { counts } : {}),
  };
}

function buildNextActions(diagnostics = [], scoped) {
  if (!diagnostics.length) {
    return [];
  }
  if (diagnostics.some((entry) => entry.kind === "ip_range_blocked")) {
    return ["stop automatic retries and inform the user to try again later"];
  }
  if (diagnostics.some((entry) => entry.kind === "captcha")) {
    return ["solve the account check in the browser before retrying"];
  }
  if (diagnostics.some((entry) => entry.kind === "manual_action_required")) {
    return ["complete the account check in an interactive browser run"];
  }
  if (scoped && diagnostics.some((entry) => entry.kind === "validation_error")) {
    return ["fix the selected ad config and rerun scoped kleinanzeigen_verify"];
  }
  return diagnostics.some((entry) => entry.kind === "validation_error")
    ? ["fix invalid config or ads and rerun kleinanzeigen_verify"]
    : [];
}

async function resolveScopedAdConfigPaths(params = {}, config = {}) {
  const adConfigPaths = normalizeStringArray(params.adConfigPaths, "adConfigPaths");
  const adDirectories = normalizeStringArray(params.adDirectories, "adDirectories");
  if (!adConfigPaths.length && !adDirectories.length) {
    return [];
  }

  const resolved = [];
  for (const adConfigPath of adConfigPaths) {
    resolved.push(await resolveAdConfigPathEntry(adConfigPath, config, {
      kind: "file",
    }));
  }
  for (const directory of adDirectories) {
    resolved.push(await resolveAdConfigPathEntry(directory, config, {
      kind: "directory",
    }));
  }
  return [...new Set(resolved)];
}

function parseAdPreflightSummary(text, filePath) {
  if (path.extname(filePath).toLowerCase() === ".json") {
    try {
      const parsed = JSON.parse(text);
      return {
        active: typeof parsed.active === "boolean" ? parsed.active : null,
        title: typeof parsed.title === "string" ? parsed.title : "",
      };
    } catch {
      return { active: null, title: "" };
    }
  }
  return parseAdSummary(text);
}

async function inactiveScopedPublishAds(adConfigPaths, config = {}) {
  if (!adConfigPaths.length) {
    return [];
  }

  const roots = normalizeStringArray(config.adRoots, "adRoots", { maxItems: 50 });
  const resolvedRoots = await Promise.all(roots.map((root) => realPath(root)));
  const inactive = [];
  for (const adConfigPath of adConfigPaths) {
    const text = await fs.readFile(adConfigPath, "utf8");
    const summary = parseAdPreflightSummary(text, adConfigPath);
    if (summary.active === true) {
      continue;
    }
    const root = resolvedRoots.find((entry) =>
      pathIsInside(adConfigPath, entry)
    ) ?? path.dirname(adConfigPath);
    inactive.push({
      adPath: displayPathForAd(adConfigPath, root),
      title: summary.title,
      active: summary.active,
    });
  }
  return inactive;
}

function buildInactivePublishPreflightResult({ operation, inactiveAds, args }) {
  return {
    ok: false,
    operation,
    outcome: {
      success: false,
      status: "preflight_failed",
      summary: "selected ad is not active; activate it before publishing",
      evidence: ["publish preflight checked selected ad active state"],
      changedAdConfigs: [],
    },
    command: {
      executable: "miniclaw",
      args: redactArgs(args),
    },
    processOk: false,
    exitCode: null,
    signal: null,
    timedOut: false,
    needsUserAction: false,
    diagnostics: inactiveAds.map((ad) => ({
      severity: "error",
      kind: "ad_preflight",
      field: "active",
      message: "selected ad is not active and would be skipped by publish",
      adPath: ad.adPath,
      title: ad.title,
      active: ad.active,
      suggestedAction:
        "use kleinanzeigen_set_ad_active with active true, then run scoped verify and publish",
    })),
    nextActions: [
      "re-read the selected ad with kleinanzeigen_read_ad",
      "use kleinanzeigen_set_ad_active with active true if the user wants to publish",
      "run scoped kleinanzeigen_verify",
      "retry kleinanzeigen_publish scoped to the same ad",
    ],
    stdout: "",
    stderr: "",
  };
}

export async function runKleinanzeigenOperation(operation, params = {}, config = {}) {
  const baseCliConfig = resolveCliConfig(config);
  await assertConfiguredFiles(baseCliConfig);
  requireConfirmed(operation, params);
  const requestedScopedAdConfigPaths = await resolveScopedAdConfigPaths(params, config);
  const adIdScopedAdConfigPaths = requestedScopedAdConfigPaths.length
    ? []
    : await resolveAdIdScopedAdConfigPaths(
        operation,
        params,
        { ...config, configPath: baseCliConfig.configPath },
      );
  const scopedAdConfigPaths = requestedScopedAdConfigPaths.length
    ? requestedScopedAdConfigPaths
    : adIdScopedAdConfigPaths;
  if (operation === "publish" && scopedAdConfigPaths.length > 0) {
    const inactiveAds = await inactiveScopedPublishAds(scopedAdConfigPaths, config);
    if (inactiveAds.length) {
      const preflightCliConfig = {
        ...baseCliConfig,
        adFileOverrides: scopedAdConfigPaths,
      };
      const args = buildKleinanzeigenArgs(operation, params, preflightCliConfig);
      return buildInactivePublishPreflightResult({
        operation,
        inactiveAds,
        args,
      });
    }
  }
  const cliConfig = scopedAdConfigPaths.length > 0
    ? { ...baseCliConfig, adFileOverrides: scopedAdConfigPaths }
    : baseCliConfig;
  await assertConfiguredFiles(cliConfig);
  const args = buildKleinanzeigenArgs(operation, params, cliConfig);
  const { diagnostics, parsed, result, stderr } = await invokeMiniclaw(
    operation,
    args,
    cliConfig,
    config,
  );
  const nextActions = buildNextActions(diagnostics, scopedAdConfigPaths.length > 0);
  const outcome = buildOperationOutcome(operation, parsed);
  const userAction = diagnostics.find((entry) =>
    entry.kind === "captcha" ||
    entry.kind === "ip_range_blocked" ||
    entry.kind === "manual_action_required"
  );

  return {
    ok: outcome.success,
    operation,
    outcome,
    command: {
      executable: "miniclaw",
      args: redactArgs(args),
    },
    processOk: result.ok,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    needsUserAction: Boolean(userAction),
    ...(userAction ? { userActionHint: nextActions[0] } : {}),
    ...(diagnostics.length ? { diagnostics, nextActions } : {}),
    stdout: "",
    stderr,
  };
}
