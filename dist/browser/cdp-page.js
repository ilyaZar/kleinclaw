/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import fs from "node:fs/promises";
import { CdpClient, cdpValue, CDP_POLL_MS, fetchJson, isRecord, sleep, throwCdpException, timeoutError, } from "./cdp-client.js";
import { CdpLocator, parseLocatorSelector, } from "./cdp-locator.js";
export class CdpPage {
    endpoint;
    target;
    url = "about:blank";
    client;
    constructor(endpoint, target, timeoutMs) {
        this.endpoint = endpoint;
        this.target = target;
        if (!target.webSocketDebuggerUrl) {
            throw new Error("Page target did not expose webSocketDebuggerUrl");
        }
        this.client = new CdpClient(target.webSocketDebuggerUrl, timeoutMs);
        this.url = target.url || "about:blank";
    }
    async init() {
        await this.client.connect();
        this.trackNavigationEvents();
        await this.client.send("Page.enable");
        await this.client.send("Runtime.enable");
        await this.client.send("DOM.enable");
        await this.refreshUrl();
    }
    async close() {
        if (this.target.id) {
            try {
                await fetchJson(`${this.endpoint}/json/close/${this.target.id}`, {
                    timeoutMs: 2000,
                });
            }
            catch {
                // Best effort; closing the browser cleans up launched tabs.
            }
        }
        this.client.close();
    }
    async dispose() {
        this.client.close();
    }
    async content() {
        return String(await this.evaluate("document.documentElement ? document.documentElement.outerHTML : ''"));
    }
    async screenshot({ path: filePath }) {
        const response = await this.client.send("Page.captureScreenshot", {
            captureBeyondViewport: true,
            format: "png",
        });
        const data = response.data;
        if (typeof data !== "string") {
            throw new Error("Page.captureScreenshot did not return image data");
        }
        await fs.writeFile(filePath, Buffer.from(data, "base64"));
        return { path: filePath };
    }
    locator(selector) {
        const step = parseLocatorSelector(selector);
        return new CdpLocator(this, [{ ...step, index: 0 }]);
    }
    getByText(text) {
        return new CdpLocator(this, [{
                bestMatch: true,
                index: 0,
                kind: "text",
                value: text,
            }]);
    }
    async evaluate(pageFunction, arg) {
        const source = typeof pageFunction === "function"
            ? pageFunction.toString()
            : String(pageFunction);
        const expression = typeof pageFunction === "function"
            ? `(${source})(${JSON.stringify(arg)})`
            : arg === undefined
                ? source
                : `(${source})(${JSON.stringify(arg)})`;
        const response = await this.client.send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        throwCdpException(response, "Runtime.evaluate failed");
        return cdpValue(response.result);
    }
    async goto(url, options = {}) {
        const timeoutMs = options.timeout ?? 15000;
        const navigationCommit = this.waitForNavigationCommit(timeoutMs);
        try {
            const response = await this.client.send("Page.navigate", { url }, { timeoutMs });
            if (typeof response.errorText === "string" && response.errorText) {
                throw new Error(`Page.navigate failed: ${response.errorText}`);
            }
            await navigationCommit.promise;
        }
        catch (error) {
            navigationCommit.cancel();
            throw error;
        }
        if (options.waitUntil) {
            await this.waitForLoadState(options.waitUntil, { timeout: timeoutMs });
        }
        await this.refreshUrl();
    }
    async waitForLoadState(state = "load", options = {}) {
        const wanted = state === "domcontentloaded" ? "interactive" : "complete";
        const timeoutMs = options.timeout ?? 15000;
        const deadline = Date.now() + timeoutMs;
        do {
            const readyState = await this.evaluate("document.readyState");
            if (readyState === "complete" || readyState === wanted) {
                await this.refreshUrl();
                return;
            }
            await sleep(CDP_POLL_MS);
        } while (Date.now() < deadline);
        throw timeoutError(`Page did not reach ${state} within ${timeoutMs / 1000} seconds`);
    }
    async waitForTimeout(ms) {
        await sleep(ms);
    }
    waitForNavigationCommit(timeoutMs) {
        let done = false;
        let timer;
        let offFrameNavigated;
        let offSameDocument;
        const promise = new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                offFrameNavigated?.();
                offSameDocument?.();
            };
            const finish = () => {
                if (done) {
                    return;
                }
                done = true;
                cleanup();
                resolve();
            };
            const fail = (error) => {
                if (done) {
                    return;
                }
                done = true;
                cleanup();
                reject(error);
            };
            offFrameNavigated = this.client.on("Page.frameNavigated", (params) => {
                const frame = params.frame;
                if (isRecord(frame) &&
                    !("parentId" in frame) &&
                    typeof frame.url === "string") {
                    this.url = frame.url;
                    finish();
                }
            });
            offSameDocument = this.client.on("Page.navigatedWithinDocument", (params) => {
                if (typeof params.url === "string") {
                    this.url = params.url;
                    finish();
                }
            });
            timer = setTimeout(() => fail(timeoutError(`Page navigation did not commit within ${timeoutMs / 1000} seconds`)), timeoutMs);
        });
        return {
            cancel: () => {
                done = true;
                clearTimeout(timer);
                offFrameNavigated?.();
                offSameDocument?.();
            },
            promise,
        };
    }
    trackNavigationEvents() {
        this.client.on("Page.frameNavigated", (params) => {
            const frame = params.frame;
            if (isRecord(frame) &&
                !("parentId" in frame) &&
                typeof frame.url === "string") {
                this.url = frame.url;
            }
        });
        this.client.on("Page.navigatedWithinDocument", (params) => {
            if (typeof params.url === "string") {
                this.url = params.url;
            }
        });
    }
    async refreshUrl() {
        const url = await this.evaluate("location.href");
        if (typeof url === "string" && url) {
            this.url = url;
        }
    }
}
