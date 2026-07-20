/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import path from "node:path";
import { cdpValue, CDP_POLL_MS, sleep, throwCdpException, timeoutError, } from "./cdp-client.js";
export function parseLocatorSelector(selector) {
    if (selector.startsWith("text=")) {
        return { kind: "text", value: selector.slice("text=".length) };
    }
    if (selector.startsWith("xpath=")) {
        return { kind: "xpath", value: selector.slice("xpath=".length) };
    }
    return { kind: "css", value: selector };
}
function expressionForSteps(locatorSteps, countLast = false) {
    return `(() => {
    const textMatches = (root, step) => {
      const needle = String(step.value).trim();
      return Array.from(root.querySelectorAll("*")).filter((elem) =>
        (elem.textContent || "").includes(needle)
      );
    };
    const queryAll = (root, step) => {
      if (!root) return [];
      const doc = root.ownerDocument || document;
      if (step.kind === "css") {
        return Array.from(root.querySelectorAll(step.value));
      }
      if (step.kind === "text") {
        return textMatches(root, step);
      }
      const result = doc.evaluate(
        step.value,
        root === document ? document : root,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      return Array.from(
        { length: result.snapshotLength },
        (_, index) => result.snapshotItem(index),
      );
    };
    const select = (root, step, honorBestMatch) => {
      const elements = queryAll(root, step);
      if (honorBestMatch && step.kind === "text" && step.bestMatch) {
        return elements.reduce((closest, elem) => {
          if (!closest) return elem;
          const needleLength = String(step.value).trim().length;
          const currentDistance = Math.abs(
            needleLength - (elem.textContent || "").length
          );
          const closestDistance = Math.abs(
            needleLength - (closest.textContent || "").length
          );
          return currentDistance < closestDistance ? elem : closest;
        }, null);
      }
      return elements[step.index] || null;
    };
    const steps = ${JSON.stringify(locatorSteps)};
    if (${countLast}) {
      const last = steps.pop();
      let current = document;
      for (const step of steps) {
        current = select(current, step, false);
        if (!current) return 0;
      }
      return last ? queryAll(current, last).length : 0;
    }
    let current = document;
    for (const step of steps) {
      current = select(current, step, true);
      if (!current) return null;
    }
    return current;
  })()`;
}
export class CdpLocator {
    page;
    steps;
    constructor(page, steps) {
        this.page = page;
        this.steps = steps;
    }
    first() {
        const next = [...this.steps];
        const last = next.at(-1);
        if (!last) {
            return this;
        }
        next[next.length - 1] = { ...last, index: 0 };
        return new CdpLocator(this.page, next);
    }
    nth(index) {
        const next = [...this.steps];
        const last = next.at(-1);
        if (!last) {
            return this;
        }
        next[next.length - 1] = { ...last, bestMatch: false, index };
        return new CdpLocator(this.page, next);
    }
    locator(selector) {
        const step = parseLocatorSelector(selector);
        return new CdpLocator(this.page, [...this.steps, { ...step, index: 0 }]);
    }
    async all() {
        const count = await this.count();
        return Array.from({ length: count }, (_, index) => this.nth(index));
    }
    async count() {
        return Number(await this.page.evaluate(expressionForSteps(this.steps, true)));
    }
    async waitFor(options = {}) {
        const timeoutMs = options.timeout ?? 5000;
        const deadline = Date.now() + timeoutMs;
        do {
            try {
                if (options.state === "visible") {
                    if (await this.isVisible()) {
                        return;
                    }
                }
                else if ((await this.count()) > 0) {
                    return;
                }
            }
            catch {
                // Keep polling until the timeout, matching nodriver's wait loop.
            }
            await sleep(CDP_POLL_MS);
        } while (Date.now() < deadline);
        throw timeoutError(`No HTML element found within ${timeoutMs / 1000} seconds.`);
    }
    async click() {
        const handle = await this.resolveElementHandle();
        if (!handle) {
            throw timeoutError("HTML element not found");
        }
        const response = await this.page.client.send("Runtime.callFunctionOn", {
            objectId: handle.objectId,
            functionDeclaration: "(el) => el.click()",
            arguments: [{ objectId: handle.objectId }],
            awaitPromise: true,
            userGesture: true,
            returnByValue: true,
        });
        throwCdpException(response, "Runtime.callFunctionOn failed");
    }
    async fill(value) {
        const objectId = await this.resolveObjectId();
        if (!objectId) {
            throw timeoutError("HTML element not found");
        }
        const response = await this.page.client.send("Runtime.callFunctionOn", {
            objectId,
            functionDeclaration: `
      function (element, value) {
        element.value = String(value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    `,
            arguments: [{ objectId }, { value }],
            returnByValue: true,
            userGesture: true,
        });
        throwCdpException(response, "Runtime.callFunctionOn failed");
    }
    async press(key) {
        await this.evaluate("(element) => element.focus()");
        const codeByKey = {
            ArrowDown: { code: "ArrowDown", keyCode: 40 },
            Backspace: { code: "Backspace", keyCode: 8 },
            Enter: { code: "Enter", keyCode: 13 },
        };
        const mapped = codeByKey[key] ?? {
            code: key,
            keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
        };
        const keyDown = {
            type: "keyDown",
            key,
            code: mapped.code,
            windowsVirtualKeyCode: mapped.keyCode,
            nativeVirtualKeyCode: mapped.keyCode,
        };
        if (key === "Enter") {
            keyDown.text = "\r";
        }
        await this.page.client.send("Input.dispatchKeyEvent", keyDown);
        await this.page.client.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key,
            code: mapped.code,
            windowsVirtualKeyCode: mapped.keyCode,
            nativeVirtualKeyCode: mapped.keyCode,
        });
    }
    async pressSequentially(value) {
        await this.type(value);
    }
    async type(value) {
        await this.evaluate("(element) => element.focus()");
        for (const char of value) {
            await this.page.client.send("Input.dispatchKeyEvent", {
                type: "char",
                text: char,
            });
        }
    }
    async sendFile(file) {
        await this.setInputFiles(file);
    }
    async setInputFiles(files) {
        const handle = await this.resolveElementHandle();
        if (!handle) {
            throw timeoutError("File input not found");
        }
        const params = {
            files: (Array.isArray(files) ? files : [files]).map((file) => path.resolve(file)),
            objectId: handle.objectId,
        };
        if (handle.backendNodeId !== undefined) {
            params.backendNodeId = handle.backendNodeId;
        }
        await this.page.client.send("DOM.setFileInputFiles", params);
    }
    async textContent() {
        return await this.evaluate("(element) => element.textContent");
    }
    async inputValue() {
        return String(await this.evaluate("(element) => element.value || ''"));
    }
    async isChecked() {
        return Boolean(await this.evaluate(`
      function (element) {
        if (element.tagName.toLowerCase() === 'input') {
          if (element.type === 'checkbox' || element.type === 'radio') {
            return element.checked
          }
        }
        return false
      }
    `));
    }
    async isDisabled() {
        return Boolean(await this.evaluate("(element) => element.hasAttribute('disabled')"));
    }
    async isEditable() {
        return Boolean(await this.evaluate(`
      function (element) {
        return !element.hasAttribute("disabled") &&
          !element.hasAttribute("readonly") &&
          (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
      }
    `));
    }
    async isEnabled() {
        return !(await this.isDisabled());
    }
    async isVisible() {
        return Boolean(await this.evaluate(`
      function (element) {
        const style = window.getComputedStyle(element);
        return style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          element.offsetWidth > 0 &&
          element.offsetHeight > 0;
      }
    `));
    }
    async getAttribute(name) {
        return await this.evaluate(`(element) => element.getAttribute(${JSON.stringify(name)})`);
    }
    async evaluate(pageFunction) {
        const objectId = await this.resolveObjectId();
        if (!objectId) {
            throw timeoutError("HTML element not found");
        }
        const source = typeof pageFunction === "function"
            ? pageFunction.toString()
            : String(pageFunction);
        const response = await this.page.client.send("Runtime.callFunctionOn", {
            objectId,
            functionDeclaration: source,
            arguments: [{ objectId }],
            returnByValue: true,
            userGesture: true,
        });
        throwCdpException(response, "Runtime.callFunctionOn failed");
        return cdpValue(response.result);
    }
    async resolveObjectId() {
        const handle = await this.resolveElementHandle();
        return handle?.objectId ?? null;
    }
    async resolveElementHandle() {
        const response = await this.page.client.send("Runtime.evaluate", {
            expression: expressionForSteps(this.steps),
            objectGroup: "miniclaw-locator",
            returnByValue: false,
        });
        const result = response.result;
        if (!result?.objectId || result.subtype === "null") {
            return null;
        }
        let backendNodeId;
        try {
            const describe = await this.page.client.send("DOM.describeNode", {
                objectId: result.objectId,
            });
            const node = describe.node;
            if (typeof node?.backendNodeId === "number") {
                backendNodeId = node.backendNodeId;
            }
        }
        catch {
            // objectId alone is accepted by CDP; backendNodeId restores nodriver parity.
        }
        return { backendNodeId, objectId: result.objectId };
    }
}
