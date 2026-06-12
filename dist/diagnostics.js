/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
export class CaptureResult {
    savedArtifacts = [];
    addSaved(filePath) {
        this.savedArtifacts.push(filePath);
    }
    hasAny() {
        return this.savedArtifacts.length > 0;
    }
}
export async function writeJson(jsonPath, jsonPayload) {
    await fsp.writeFile(jsonPath, `${JSON.stringify(jsonPayload, jsonValueReplacer, 2)}\n`, "utf8");
}
export async function copyLog(logFilePath, logPath) {
    if (!fs.existsSync(logFilePath)) {
        return false;
    }
    await fsp.copyFile(logFilePath, logPath);
    return true;
}
function jsonValueReplacer(_key, value) {
    if (value instanceof Error) {
        return {
            message: value.message,
            name: value.name,
            stack: value.stack,
        };
    }
    return value;
}
function timestampFor(date) {
    return date.toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "")
        .replace("T", "T");
}
function safeSubject(subject) {
    return subject.replace(/[^A-Za-z0-9_-]/g, "_");
}
function buildBaseName({ attempt, basePrefix, now, randomHex, subject, }) {
    let base = `${basePrefix}_${timestampFor(now())}_${randomHex()}`;
    if (attempt !== null && attempt !== undefined) {
        base = `${base}_attempt${attempt}`;
    }
    if (subject) {
        base = `${base}_${safeSubject(subject)}`;
    }
    return base;
}
async function saveScreenshot(page, screenshotPath) {
    if (page.save_screenshot) {
        await page.save_screenshot(screenshotPath);
        return true;
    }
    if (page.screenshot) {
        await page.screenshot({ path: screenshotPath });
        return true;
    }
    return false;
}
async function pageContent(page) {
    if (page.get_content) {
        return page.get_content();
    }
    if (page.content) {
        return page.content();
    }
    return null;
}
export async function captureDiagnostics({ attempt = null, basePrefix, copyLog: shouldCopyLog = false, jsonPayload = null, logFilePath = null, now = () => new Date(), outputDir, page = null, randomHex = () => crypto.randomBytes(4).toString("hex"), subject = null, }) {
    const result = new CaptureResult();
    try {
        await fsp.mkdir(outputDir, { recursive: true });
        const base = buildBaseName({
            attempt,
            basePrefix,
            now,
            randomHex,
            subject,
        });
        const screenshotPath = path.join(outputDir, `${base}.png`);
        const htmlPath = path.join(outputDir, `${base}.html`);
        const jsonPath = path.join(outputDir, `${base}.json`);
        const logPath = path.join(outputDir, `${base}.log`);
        if (page) {
            try {
                if (await saveScreenshot(page, screenshotPath)) {
                    result.addSaved(screenshotPath);
                }
            }
            catch {
                // Capture failures must not hide the original operation failure.
            }
            try {
                const html = await pageContent(page);
                if (html !== null) {
                    await fsp.writeFile(htmlPath, html, "utf8");
                    result.addSaved(htmlPath);
                }
            }
            catch {
                // Capture failures must not hide the original operation failure.
            }
        }
        if (jsonPayload !== null) {
            try {
                await writeJson(jsonPath, jsonPayload);
                result.addSaved(jsonPath);
            }
            catch {
                // Capture failures must not hide the original operation failure.
            }
        }
        if (shouldCopyLog && logFilePath) {
            try {
                if (await copyLog(logFilePath, logPath)) {
                    result.addSaved(logPath);
                }
            }
            catch {
                // Capture failures must not hide the original operation failure.
            }
        }
    }
    catch {
        // Capture failures must not hide the original operation failure.
    }
    return result;
}
