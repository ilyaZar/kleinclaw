/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type LoginController } from "./auth-types.js";

export const IP_RANGE_BLOCK_MESSAGE =
  "Kleinanzeigen temporarily blocked this network or IP range.";

export class IpRangeBlockedError extends Error {
  constructor() {
    super(IP_RANGE_BLOCK_MESSAGE);
    this.name = "IpRangeBlockedError";
  }
}

function isIpRangeBlockedPageText(text: unknown): boolean {
  const normalized = String(text ?? "").replace(/\s+/g, " ").toLowerCase();
  return normalized.includes("ip-bereich vorübergehend gesperrt") ||
    (
      normalized.includes("ip-bereich") &&
      normalized.includes("vorbeugung von betrug") &&
      normalized.includes("von der nutzung von kleinanzeigen ausgeschlossen")
    );
}

export async function assertIpRangeAvailable(
  controller: LoginController,
): Promise<void> {
  const text = await controller.webExecute(
    "document.body ? document.body.innerText.slice(0, 4000) : ''",
  );
  if (isIpRangeBlockedPageText(text)) {
    throw new IpRangeBlockedError();
  }
}
