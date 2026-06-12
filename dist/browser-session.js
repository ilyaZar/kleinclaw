/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { buildBrowserSessionPlan, writeInitialPrefs, } from "./browser.js";
export class LiveBrowserSessionDisabledError extends Error {
    constructor() {
        super("Live browser sessions are disabled. Pass allowLiveBrowser: true " +
            "only from an explicitly approved manual run.");
        this.name = "LiveBrowserSessionDisabledError";
    }
}
function defaultDriver() {
    return {
        connectOverCDP: (endpointURL, options) => chromium.connectOverCDP(endpointURL, options),
        launchPersistentContext: (userDataDir, options) => chromium.launchPersistentContext(userDataDir, options),
    };
}
function isBrowserSessionPlan(value) {
    return (typeof value === "object" &&
        value !== null &&
        "mode" in value &&
        "browserArgs" in value &&
        "remoteHost" in value);
}
export function browserSessionPlanFrom(source) {
    return isBrowserSessionPlan(source)
        ? source
        : buildBrowserSessionPlan(source);
}
function firstContext(browser) {
    const [context] = browser.contexts();
    if (!context) {
        throw new Error("Connected browser has no default context");
    }
    return context;
}
async function firstPage(context) {
    const [page] = context.pages();
    return page ?? context.newPage();
}
function ensureProfilePrefs(plan) {
    if (!plan.profileDir || !plan.preferencesFile) {
        return;
    }
    fs.mkdirSync(plan.profileDir, { recursive: true });
    if (!fs.existsSync(plan.preferencesFile)) {
        writeInitialPrefs(plan.preferencesFile);
    }
}
async function closeBrowserSession(mode, browser, context) {
    if (mode === "launch") {
        await context.close();
        return;
    }
    if (browser) {
        await browser.close();
    }
    else {
        await context.close();
    }
}
export async function createBrowserSession(source, { allowLiveBrowser = false, driver = defaultDriver(), timeout, ensureProfilePrefs: shouldEnsureProfilePrefs = true, } = {}) {
    if (!allowLiveBrowser) {
        throw new LiveBrowserSessionDisabledError();
    }
    const plan = browserSessionPlanFrom(source);
    let browser = null;
    let context;
    if (plan.mode === "connect") {
        if (plan.remotePort === null) {
            throw new Error("Remote browser session plan is missing remotePort");
        }
        browser = await driver.connectOverCDP(`http://${plan.remoteHost}:${plan.remotePort}`, timeout === undefined ? undefined : { timeout: timeout * 1000 });
        context = firstContext(browser);
    }
    else {
        if (shouldEnsureProfilePrefs) {
            ensureProfilePrefs(plan);
        }
        context = await driver.launchPersistentContext(plan.userDataDir ?? "", {
            acceptDownloads: true,
            args: plan.browserArgs,
            chromiumSandbox: plan.sandbox,
            env: { ...process.env, ...plan.environment },
            executablePath: plan.browserExecutablePath || undefined,
            headless: false,
            timeout: timeout === undefined ? undefined : timeout * 1000,
        });
        browser = context.browser?.() ?? null;
    }
    const page = await firstPage(context);
    return {
        mode: plan.mode,
        browser,
        context,
        page,
        plan,
        close: () => closeBrowserSession(plan.mode, browser, context),
    };
}
export function preferencesFileForSession(plan) {
    return plan.preferencesFile ? path.resolve(plan.preferencesFile) : null;
}
