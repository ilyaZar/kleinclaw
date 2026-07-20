import fs from "node:fs/promises";
import path from "node:path";

import {
  buildBrowserDiagnosticReport,
} from "../browser/browser-chrome-diagnostics.js";
import { loadConfigFile, saveDataFile } from "../io.js";
import {
  AdUpdateStrategy,
  contentHashForLoadedAd,
  evaluateAutoPriceReduction,
} from "../model/ad-model.js";
import { loadSelectedAds } from "../selection.js";
import { DEFAULT_CONFIG } from "./cli-help.js";
import {
  commandStatus,
  printDiagnosticLine,
  setCommandResult,
  setCountResult,
} from "./cli-messages.js";
import { type ParsedArgs } from "./cli-types.js";

export async function createDefaultConfig(configPath: string): Promise<number> {
  try {
    await fs.access(configPath);
    console.error(`Config file ${configPath} already exists. Aborting creation.`);
    return 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, DEFAULT_CONFIG, { encoding: "utf8", mode: 0o600 });
  console.error(`Saving ${configPath}`);
  return 0;
}

function previewDecision(
  label: "publish" | "update",
  adFile: string,
  reason: string,
): void {
  console.error(`Auto price reduction preview for [${adFile}] (${label}): ${reason}`);
}

export async function verifyConfig(parsed: ParsedArgs): Promise<number> {
  const config = await loadConfigFile(parsed.configPath);
  const ads = await loadSelectedAds({
    configPath: parsed.configPath,
    config,
    selector: "all",
    adFileOverrides: parsed.adFileOverrides,
    excludeAdsWithId: false,
  });

  for (const { ad, filePath } of ads) {
    const priceState = {
      price: ad.price,
      autoPriceReduction: ad.autoPriceReduction,
      priceReductionCount: ad.priceReductionCount,
      repostCount: ad.repostCount,
      updatedOn: ad.updatedOn,
      createdOn: ad.createdOn,
    };
    const publishDecision = evaluateAutoPriceReduction(priceState, {
      mode: AdUpdateStrategy.Replace,
    });
    const updateDecision = evaluateAutoPriceReduction(priceState, {
      mode: AdUpdateStrategy.Modify,
    });
    if (publishDecision.enabled) {
      previewDecision("publish", filePath, publishDecision.reason);
    }
    if (updateDecision.enabled) {
      previewDecision("update", filePath, updateDecision.reason);
    }
  }

  setCommandResult(parsed, "succeeded", {
    message: "DONE: No configuration errors found.",
  });
  return 0;
}

export async function updateContentHashes(parsed: ParsedArgs): Promise<number> {
  const config = await loadConfigFile(parsed.configPath);
  const ads = await loadSelectedAds({
    configPath: parsed.configPath,
    config,
    selector: "all",
    adFileOverrides: parsed.adFileOverrides,
    excludeAdsWithId: false,
  });
  if (!ads.length) {
    setCountResult(parsed, 0, 0, 0, "DONE: No active ads found.");
    return 0;
  }

  let changed = 0;
  for (const { ad, filePath, raw } of ads) {
    const contentHash = contentHashForLoadedAd(ad);
    if (raw.content_hash !== contentHash) {
      raw.content_hash = contentHash;
      await saveDataFile(filePath, raw);
      changed += 1;
    }
  }

  const noun = changed === 1 ? "ad" : "ads";
  const skipped = ads.length - changed;
  setCommandResult(parsed, commandStatus(changed, 0, ads.length), {
    counts: { changed, failed: 0, skipped, total: ads.length },
    message: `DONE: Updated [content_hash] in ${changed} ${noun}`,
  });
  return 0;
}

export async function runDiagnose(parsed: ParsedArgs): Promise<number> {
  const config = await loadConfigFile(parsed.configPath);
  const report = buildBrowserDiagnosticReport(config);
  if (parsed.output === "text") {
    for (const line of report.lines) {
      printDiagnosticLine(line.status, line.message);
    }
  }
  const diagnostics = report.lines.map((line) => ({
    code: "browser_diagnostic" as const,
    severity: line.status === "fail"
      ? "error" as const
      : line.status === "warn"
      ? "warning" as const
      : "info" as const,
    message: line.message,
  }));
  const failed = diagnostics.some((line) => line.severity === "error");
  setCommandResult(parsed, failed ? "failed" : "succeeded", { diagnostics });
  return 0;
}
