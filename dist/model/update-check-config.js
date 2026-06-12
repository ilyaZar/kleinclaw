/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { ValidationError } from "./validation-error.js";
export class UpdateCheckConfig {
    enabled;
    channel;
    interval;
    constructor(input = {}) {
        this.enabled = input.enabled ?? true;
        const channel = input.channel ?? "latest";
        if (channel !== "latest" && channel !== "preview") {
            throw new ValidationError("update_check.channel must be latest or preview");
        }
        this.channel = channel;
        this.interval = input.interval ?? "7d";
    }
}
