/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { run as runInternal } from "./cli.js";

export function run(argv: string[] = process.argv): Promise<number> {
  return runInternal(argv);
}
