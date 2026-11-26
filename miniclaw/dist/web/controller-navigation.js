/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import assert from "node:assert";
import { normalizeRemoteObjectResult } from "../browser/browser-remote-object.js";
import { ControllerSelectionControls } from "./controller-selection-controls.js";
import { ensureStatusCode, requirePageMethod, validCodes, } from "./controller-support.js";
const DEFAULT_WEB_REQUEST_TIMEOUT = 60;
export class ControllerNavigation extends ControllerSelectionControls {
    async webExecute(jscode) {
        const evaluate = requirePageMethod(this.page.evaluate, "evaluate");
        const result = await evaluate.call(this.page, jscode);
        return normalizeRemoteObjectResult(result);
    }
    async webRequest(url, method = "GET", validResponseCodes = 200, headers = null, { timeout } = {}) {
        const effectiveTimeout = this.timeoutConfig
            ? this.effectiveTimeout("webRequest", timeout, 0)
            : timeout ?? DEFAULT_WEB_REQUEST_TIMEOUT;
        const timeoutMs = Math.max(1, Math.trunc(effectiveTimeout * 1000));
        const requestMethod = method.toUpperCase();
        const response = await this.withTimeout(requirePageMethod(this.page.evaluate, "evaluate").call(this.page, async ({ requestUrl, requestMethod, requestHeaders, requestTimeoutMs, }) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
            try {
                const fetchResponse = await fetch(requestUrl, {
                    method: requestMethod,
                    redirect: "follow",
                    headers: requestHeaders,
                    signal: controller.signal,
                });
                const responseHeaders = {};
                fetchResponse.headers.forEach((value, key) => {
                    responseHeaders[key] = value;
                });
                return {
                    statusCode: fetchResponse.status,
                    statusMessage: fetchResponse.statusText,
                    headers: responseHeaders,
                    content: await fetchResponse.text(),
                };
            }
            finally {
                clearTimeout(timer);
            }
        }, {
            requestUrl: url,
            requestMethod,
            requestHeaders: headers ?? {},
            requestTimeoutMs: timeoutMs,
        }), effectiveTimeout, `HTTP ${requestMethod} to ${url} did not finish within ` +
            `${effectiveTimeout} seconds.`);
        const normalized = normalizeRemoteObjectResult(response);
        ensureStatusCode(normalized);
        if (!validCodes(validResponseCodes).has(normalized.statusCode)) {
            throw new assert.AssertionError({
                message: `Invalid response "${normalized.statusCode} ` +
                    `${normalized.statusMessage}" received for HTTP ${requestMethod} to ${url}`,
            });
        }
        return normalized;
    }
    async webOpen(url, { timeout, reloadIfAlreadyOpen = false, } = {}) {
        if (!reloadIfAlreadyOpen && this.page.url === url) {
            return;
        }
        const effectiveTimeout = this.effectiveTimeout("pageLoad", timeout, 0);
        const goto = requirePageMethod(this.page.goto, "goto");
        await goto.call(this.page, url, {
            timeout: effectiveTimeout * 1000,
        });
        await this.webAwait(() => this.webExecute("document.readyState == 'complete'"), {
            applyMultiplier: false,
            timeout: effectiveTimeout,
            timeoutErrorMessage: `Page did not finish loading within ${effectiveTimeout} seconds.`,
        });
    }
    async webScrollPageDown(scrollLength = 10, scrollSpeed = 10000, { scrollBackTop = false, } = {}) {
        let currentYPos = 0;
        const bottomYPos = Number(await this.webExecute("document.body.scrollHeight"));
        while (currentYPos < bottomYPos) {
            currentYPos += scrollLength;
            await this.webExecute(`window.scrollTo(0, ${currentYPos})`);
            await this.sleeper((scrollLength / scrollSpeed) * 1000);
        }
        if (!scrollBackTop) {
            return;
        }
        while (currentYPos > 0) {
            currentYPos -= scrollLength;
            await this.webExecute(`window.scrollTo(0, ${currentYPos})`);
            await this.sleeper((scrollLength / scrollSpeed / 2) * 1000);
        }
    }
}
