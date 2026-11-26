/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

export {
  MAX_DESCRIPTION_LENGTH,
  toAd,
  type Ad,
  type AdInput,
  type ContactInput,
} from "./ad-normalization.js";
export {
  contentHashForAd,
  contentHashForLoadedAd,
} from "./content-hash.js";
export {
  AdUpdateStrategy,
  applyAutoPriceReduction,
  evaluateAutoPriceReduction,
  type AdLike,
} from "./price-reduction.js";
export {
  CARRIER_CODE_BY_OPTION,
  CARRIER_CODES_BY_SIZE,
  OPTION_NAME_BY_CARRIER_CODE,
  SIZE_INFO_BY_CARRIER_CODE,
} from "./shipping.js";
