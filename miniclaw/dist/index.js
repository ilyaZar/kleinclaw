/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { run as runInternal } from "./cli.js";
export function run(argv = process.argv) {
    return runInternal(argv);
}
