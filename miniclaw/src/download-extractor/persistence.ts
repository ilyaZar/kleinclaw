/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import fs from "node:fs/promises";
import path from "node:path";

import { type AdInput } from "../model/ad-model.js";
import { saveDataFile } from "../io.js";

export const AD_SCHEMA_HEADER =
  "# yaml-language-server: $schema=miniclaw://schemas/ad.schema.json";

export const STAGING_DIR_PREFIX = ".tmp-";

const BACKUP_DIR_PREFIX = ".bak-";
const RMTREE_RETRY_ATTEMPTS = 5;
const RMTREE_RETRY_DELAY_MS = 250;

export interface SaveDownloadedAdOptions {
  adConfig: AdInput;
  adFileStem: string;
  adId: number;
  finalDir: string;
  stagingDir: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function removeTreeWithRetries(target: string): Promise<void> {
  for (let attempt = 0; attempt < RMTREE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await fs.rm(target, { force: true, recursive: true });
      return;
    } catch (error) {
      if (attempt + 1 === RMTREE_RETRY_ATTEMPTS) {
        throw error;
      }
      await sleep(RMTREE_RETRY_DELAY_MS);
    }
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function saveDownloadedAd({
  adConfig,
  adFileStem,
  adId,
  finalDir,
  stagingDir,
}: SaveDownloadedAdOptions): Promise<void> {
  const adFilePath = path.join(stagingDir, `${adFileStem}.yaml`);
  const backupDir = path.join(
    path.dirname(finalDir),
    `${BACKUP_DIR_PREFIX}${adFileStem}`,
  );
  let backupCreatedByUs = false;

  try {
    await saveDataFile(adFilePath, adConfig, { header: AD_SCHEMA_HEADER });

    if (await fileExists(backupDir)) {
      throw new FileExistsError(
        `Backup directory ${backupDir} already exists. ` +
          `Aborting download for ad ${adId} to avoid data loss.`,
      );
    }
    if (await fileExists(finalDir)) {
      await fs.rename(finalDir, backupDir);
      backupCreatedByUs = true;
    }

    await fs.rename(stagingDir, finalDir);

    if (await fileExists(backupDir)) {
      try {
        await removeTreeWithRetries(backupDir);
      } catch {
        // Keep the successful new download even when backup cleanup fails.
      }
    }
  } catch (error) {
    if (
      backupCreatedByUs &&
      await fileExists(backupDir) &&
      !await fileExists(finalDir)
    ) {
      try {
        await fs.rename(backupDir, finalDir);
      } catch {
        // Preserve the original error after best-effort rollback.
      }
    }
    if (await fileExists(stagingDir)) {
      try {
        await removeTreeWithRetries(stagingDir);
      } catch {
        // Preserve the original error after best-effort cleanup.
      }
    }
    throw error;
  }
}

export class FileExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileExistsError";
  }
}
