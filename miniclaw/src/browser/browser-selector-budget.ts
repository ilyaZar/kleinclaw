/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

const PRIMARY_SELECTOR_BUDGET_RATIO = 0.70;
const BACKUP_SELECTOR_BUDGET_CAP_SECONDS = 0.75;
const BACKUP_SELECTOR_BUDGET_FLOOR_SECONDS = 0.25;

export function allocateSelectorGroupBudgets(
  totalTimeout: number,
  selectorCount: number,
): number[] {
  if (selectorCount <= 0) {
    throw new Error("selector_count must be > 0");
  }
  if (selectorCount === 1) {
    return [Math.max(totalTimeout, 0)];
  }
  if (totalTimeout <= 0) {
    return Array.from({ length: selectorCount }, () => 0);
  }

  const floorTotal = BACKUP_SELECTOR_BUDGET_FLOOR_SECONDS * selectorCount;
  if (totalTimeout < floorTotal) {
    const equalShare = totalTimeout / selectorCount;
    return Array.from({ length: selectorCount }, () => equalShare);
  }

  const reserveForBackups =
    BACKUP_SELECTOR_BUDGET_FLOOR_SECONDS * (selectorCount - 1);
  let primary = Math.min(
    totalTimeout * PRIMARY_SELECTOR_BUDGET_RATIO,
    totalTimeout - reserveForBackups,
  );
  primary = Math.max(primary, BACKUP_SELECTOR_BUDGET_FLOOR_SECONDS);

  const budgets = [primary];
  let remaining = totalTimeout - primary;

  for (let index = 0; index < selectorCount - 1; index += 1) {
    const isLastBackup = index === selectorCount - 2;
    if (isLastBackup) {
      const allocation = Math.min(remaining, BACKUP_SELECTOR_BUDGET_CAP_SECONDS);
      budgets.push(allocation);
      const surplus = remaining - allocation;
      if (surplus > 0) {
        budgets[0] = (budgets[0] ?? 0) + surplus;
      }
      continue;
    }

    const remainingSlotsAfterThis = selectorCount - budgets.length - 1;
    const minReserve =
      BACKUP_SELECTOR_BUDGET_FLOOR_SECONDS * remainingSlotsAfterThis;
    let allocation = remaining - minReserve;
    allocation = Math.max(BACKUP_SELECTOR_BUDGET_FLOOR_SECONDS, allocation);
    allocation = Math.min(BACKUP_SELECTOR_BUDGET_CAP_SECONDS, allocation);
    budgets.push(allocation);
    remaining -= allocation;
  }

  return budgets;
}
