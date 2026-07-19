import { type DownloadAdHook, type ExtractOwnAdsUrlsHook, type NavigateToAdPageHook } from "../download-orchestration.js";
import { type ExtendAdHook } from "../extend-orchestration.js";
import { type Config } from "../model/config-model.js";
import { type CapturePublishError, type DeleteAdHook, type PublishedAdState, type PublishingResultHook, type PublishAdAttempt, type SleepHook } from "../publish-orchestration.js";
import { type LoadedAd } from "../selection.js";
export type Command = "publish" | "verify" | "delete" | "update" | "download" | "extend" | "update-content-hash" | "create-config" | "diagnose" | "help" | "version";
export type CommandStatus = "succeeded" | "no_op" | "partial_failure" | "failed";
export type DiagnosticCode = "validation_error" | "ip_range_blocked" | "captcha" | "manual_action_required" | "browser_diagnostic" | "internal_error";
export interface CommandDiagnostic {
    code: DiagnosticCode;
    severity: "info" | "warning" | "error";
    message: string;
    retryAfterSeconds?: number;
}
export interface CommandResult {
    schemaVersion: 1;
    command: string;
    status: CommandStatus;
    counts?: {
        changed: number;
        failed: number;
        skipped?: number;
        total: number;
    };
    diagnostics?: CommandDiagnostic[];
    version?: string;
    commands?: string[];
}
export interface ParsedArgs {
    command: Command | string;
    adsSelector: string;
    adsSelectorExplicit: boolean;
    adFileOverrides: string[];
    configPath: string;
    configArg: string | null;
    logfilePath: string | null;
    logfileExplicitlyProvided: boolean;
    logfileArg: string | null;
    workspaceMode: "portable" | "xdg" | null;
    keepOldAds: boolean;
    allowLiveBrowser: boolean;
    output: "text" | "json";
    result: CommandResult | null;
}
export interface CommandPreparation {
    command: Command | string;
    adsSelector: string;
    adsSelectorExplicit: boolean;
    ok: boolean;
    error: string | null;
}
export interface PlannedAd {
    relativePath: string;
    title: string;
    id: number | null;
    active: boolean;
}
export interface CommandPlan {
    command: Command | string;
    adsSelector: string;
    loadAds: boolean;
    excludeAdsWithId: boolean | null;
    selectedCount: number | null;
    selectedAds: PlannedAd[];
    needsBrowser: boolean;
    doneMessage: string | null;
}
export interface SideEffectCommandContext {
    ads: readonly LoadedAd[];
    config: Config;
    parsed: ParsedArgs;
    strictPublishedAds?: boolean;
}
export interface SideEffectHandlers {
    captureError?: CapturePublishError;
    deleteAd?: DeleteAdHook;
    downloadAd?: DownloadAdHook;
    extractOwnAdsUrls?: ExtractOwnAdsUrlsHook;
    fetchPublishedAds?: (context: SideEffectCommandContext) => Promise<readonly PublishedAdState[]> | readonly PublishedAdState[];
    extendAd?: ExtendAdHook;
    navigateToAdPage?: NavigateToAdPageHook;
    publishAd?: PublishAdAttempt;
    sleep?: SleepHook;
    updateAd?: PublishAdAttempt;
    waitForPublishingResult?: PublishingResultHook;
}
export interface CloseableSideEffectHandlers extends SideEffectHandlers {
    close?: () => Promise<void>;
}
export type CreateLiveSideEffects = (context: {
    config: Config;
    parsed: ParsedArgs;
}) => Promise<CloseableSideEffectHandlers> | CloseableSideEffectHandlers;
export interface RunOptions {
    createLiveSideEffects?: CreateLiveSideEffects;
    sideEffects?: SideEffectHandlers;
}
