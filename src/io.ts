/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import fs from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { type AdInput, toAd } from "./model/ad-model.js";
import { Config, type ConfigInput } from "./model/config-model.js";

export async function loadDataFile(filePath: string): Promise<unknown> {
  const text = await fs.readFile(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") {
    return JSON.parse(text);
  }
  return parseYaml(text);
}

export async function saveDataFile(
  filePath: string,
  data: Record<string, unknown>,
  { header = "" }: { header?: string } = {},
): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  const body = ext === ".json"
    ? `${JSON.stringify(data, null, 2)}\n`
    : stringifyYaml(data);
  const text = header && ext !== ".json" ? `${header}\n${body}` : body;
  await fs.writeFile(filePath, text, "utf8");
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a mapping/object`);
  }
  return value as Record<string, unknown>;
}

export async function loadConfigFile(filePath: string): Promise<Config> {
  return new Config(asRecord(await loadDataFile(filePath), "config") as ConfigInput);
}

export async function loadAdFile(
  filePath: string,
  config: Config,
): Promise<ReturnType<typeof toAd>> {
  const raw = asRecord(await loadDataFile(filePath), "ad") as AdInput;
  return toAd(raw, config.adDefaults);
}
