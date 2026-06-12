/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

export {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_TITLE_LENGTH,
  toAd,
  type Ad,
  type AdInput,
  type ContactInput,
} from "./ad-normalization.js";
export {
  adToContentHashInput,
  contentHashForAd,
  contentHashForLoadedAd,
  type JsonValue,
} from "./content-hash.js";
export {
  AdUpdateStrategy,
  applyAutoPriceReduction,
  calculateAutoPrice,
  calculateAutoPriceWithTrace,
  evaluateAutoPriceReduction,
  type AdLike,
  type AutoPriceTrace,
  type PriceReductionDecision,
  type PriceReductionStep,
} from "./price-reduction.js";
export {
  CARRIER_CODE_BY_OPTION,
  CARRIER_CODES_BY_SIZE,
  OPTION_NAME_BY_CARRIER_CODE,
  SHIPPING_OPTIONS,
  SIZE_INFO_BY_CARRIER_CODE,
} from "./shipping.js";
