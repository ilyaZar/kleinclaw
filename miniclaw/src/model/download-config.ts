/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { ValidationError } from "./validation-error.js";

export interface DownloadConfigInput {
  dir?: string;
  includeAllMatchingShippingOptions?: boolean;
  include_all_matching_shipping_options?: boolean;
  excludedShippingOptions?: string[];
  excluded_shipping_options?: string[];
  folderNameMaxLength?: number;
  folder_name_max_length?: number;
  folderNameTemplate?: string;
  folder_name_template?: string;
  adFileNameTemplate?: string;
  ad_file_name_template?: string;
}

export class DownloadConfig {
  readonly dir: string;
  readonly includeAllMatchingShippingOptions: boolean;
  readonly excludedShippingOptions: string[];
  readonly folderNameMaxLength: number;
  readonly folderNameTemplate: string;
  readonly adFileNameTemplate: string;

  constructor(input: DownloadConfigInput = {}) {
    this.dir = (input.dir ?? "downloaded-ads").trim();
    if (!this.dir) {
      throw new ValidationError("download.dir must be a non-empty path");
    }
    this.includeAllMatchingShippingOptions =
      input.includeAllMatchingShippingOptions ??
      input.include_all_matching_shipping_options ??
      false;
    this.excludedShippingOptions = [
      ...(input.excludedShippingOptions ?? input.excluded_shipping_options ?? []),
    ];
    this.folderNameMaxLength =
      input.folderNameMaxLength ?? input.folder_name_max_length ?? 100;
    this.folderNameTemplate = validateDownloadTemplate(
      input.folderNameTemplate ??
        input.folder_name_template ??
        "ad_{id}_{title}",
      {
        fieldName: "download.folder_name_template",
        requiredFields: new Set(["id"]),
      },
    );
    this.adFileNameTemplate = validateDownloadTemplate(
      input.adFileNameTemplate ?? input.ad_file_name_template ?? "ad_{id}",
      {
        fieldName: "download.ad_file_name_template",
        requiredFields: new Set(["id"]),
      },
    );
  }
}

function validateDownloadTemplate(
  template: string,
  {
    fieldName,
    requiredFields,
  }: {
    fieldName: string;
    requiredFields: Set<string>;
  },
): string {
  const trimmed = template.trim();
  if (!trimmed) {
    throw new ValidationError(`${fieldName} must be a non-empty template`);
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new ValidationError(`${fieldName} must not contain path separators`);
  }

  const fields = [...trimmed.matchAll(/\{([^{}]*)\}/g)].map(
    (match) => match[1] ?? "",
  );
  if (fields.some((field) => !field)) {
    throw new ValidationError(`${fieldName} contains an empty placeholder`);
  }
  for (const field of fields) {
    if (!["id", "title"].includes(field)) {
      throw new ValidationError(
        `${fieldName} only supports placeholders: {id}, {title}`,
      );
    }
    if (fields.filter((candidate) => candidate === field).length > 1) {
      throw new ValidationError(
        `${fieldName} may contain at most one {${field}} placeholder`,
      );
    }
  }
  for (const field of requiredFields) {
    if (!fields.includes(field)) {
      throw new ValidationError(
        `${fieldName} must include placeholder(s): {${field}}`,
      );
    }
  }
  if (!fields.length) {
    throw new ValidationError(
      `${fieldName} must include at least one placeholder: {id}, {title}`,
    );
  }
  return trimmed;
}
