/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { ValidationError } from "./validation-error.js";

export type UpdateCheckChannel = "latest" | "preview";

export interface UpdateCheckConfigInput {
  enabled?: boolean;
  channel?: UpdateCheckChannel | string;
  interval?: string;
}

export class UpdateCheckConfig {
  readonly enabled: boolean;
  readonly channel: UpdateCheckChannel;
  readonly interval: string;

  constructor(input: UpdateCheckConfigInput = {}) {
    this.enabled = input.enabled ?? true;
    const channel = input.channel ?? "latest";
    if (channel !== "latest" && channel !== "preview") {
      throw new ValidationError("update_check.channel must be latest or preview");
    }
    this.channel = channel;
    this.interval = input.interval ?? "7d";
  }
}
