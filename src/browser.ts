/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

export {
  CHROME_136_VERSION,
  ChromeVersionInfo,
  buildBrowserDiagnosticReport,
  chromeVersionProbeOptionsFromConfig,
  detectChromeVersionFromBinary,
  detectChromeVersionFromRemoteDebugging,
  getChromeVersionDiagnosticInfo,
  getChromeVersionDiagnosticInfoFromConfig,
  normalizeBrowserName,
  parseVersionString,
  validateChrome136Configuration,
  type BrowserDiagnosticLine,
  type BrowserDiagnosticReport,
  type ChromeVersionProbeOptions,
  type DiagnosticStatus,
} from "./browser/chrome-diagnostics.js";
export {
  remoteDebuggingPortFromArguments,
} from "./browser/browser-arguments.js";
export {
  convertRemoteObjectValue,
  isRemoteObjectLike,
  normalizeRemoteObjectResult,
} from "./browser/remote-object.js";
export { allocateSelectorGroupBudgets } from "./browser/selector-budget.js";
export {
  DEFAULT_BROWSER_ARGS,
  buildBrowserSessionPlan,
  buildInitialPrefs,
  hasNonEmptyUserDataDirArg,
  resolveUserDataDirPaths,
  writeInitialPrefs,
  type BrowserSessionPlan,
  type BrowserSessionPlanOptions,
} from "./browser/session-plan.js";
