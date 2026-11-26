import fs from "node:fs/promises";
import { assertSafeBrowserConfigureParams, buildBrowserStatusPayload, detectInstalledBrowsers, resolveBrowserUpdates, } from "./browser-settings.js";
import { createTemporaryConfig, parseBrowserConfigText, replaceBrowserYaml, writeFileAtomic, } from "./cli-browser-config-file.js";
import { buildKleinanzeigenArgs } from "./cli-operation-arguments.js";
import { assertConfiguredFiles, invokeMiniclaw, resolveCliConfig, } from "./miniclaw-runtime.js";
import { redactArgs } from "./process-boundary.js";
export async function getKleinanzeigenBrowserStatus(config = {}) {
    const cliConfig = resolveCliConfig(config);
    await assertConfiguredFiles(cliConfig);
    const text = await fs.readFile(cliConfig.configPath, "utf8");
    const browserConfig = parseBrowserConfigText(text);
    const detectedBrowsers = await detectInstalledBrowsers({
        commandRunner: cliConfig.commandRunner,
    });
    return buildBrowserStatusPayload({ cliConfig, browserConfig, detectedBrowsers });
}
export async function configureKleinanzeigenBrowser(params = {}, config = {}) {
    const cliConfig = resolveCliConfig(config);
    await assertConfiguredFiles(cliConfig);
    const stat = await fs.stat(cliConfig.configPath);
    const text = await fs.readFile(cliConfig.configPath, "utf8");
    const currentBrowserConfig = parseBrowserConfigText(text);
    assertSafeBrowserConfigureParams(params);
    const detectedBrowsers = await detectInstalledBrowsers({
        commandRunner: cliConfig.commandRunner,
    });
    const previous = buildBrowserStatusPayload({
        cliConfig,
        browserConfig: currentBrowserConfig,
        detectedBrowsers,
    }).browser;
    const updates = await resolveBrowserUpdates(params, cliConfig, currentBrowserConfig);
    const nextText = replaceBrowserYaml(text, updates);
    const changed = nextText !== text;
    if (changed) {
        await writeFileAtomic(cliConfig.configPath, nextText, stat.mode & 0o777);
    }
    const nextBrowserConfig = parseBrowserConfigText(nextText);
    const status = buildBrowserStatusPayload({
        cliConfig,
        browserConfig: nextBrowserConfig,
        detectedBrowsers,
    });
    return {
        ...status,
        operation: "browser_configure",
        changed,
        changedKeys: Object.keys(updates),
        previous,
    };
}
function browserCheckOverridesRequested(params = {}) {
    return [
        "browser",
        "binaryLocation",
        "usePrivateWindow",
        "profileMode",
        "userDataDir",
        "profileName",
    ].some((key) => params[key] !== undefined);
}
export async function checkKleinanzeigenBrowser(params = {}, config = {}) {
    const cliConfig = resolveCliConfig(config);
    await assertConfiguredFiles(cliConfig);
    const original = await fs.readFile(cliConfig.configPath, "utf8");
    const currentBrowserConfig = parseBrowserConfigText(original);
    const requestedOverrides = browserCheckOverridesRequested(params);
    const updates = requestedOverrides
        ? await resolveBrowserUpdates({ ...params, confirm: true }, cliConfig, currentBrowserConfig)
        : {};
    const checkText = requestedOverrides
        ? replaceBrowserYaml(original, updates)
        : original;
    const tempConfig = requestedOverrides
        ? await createTemporaryConfig(cliConfig, checkText)
        : { config: cliConfig, cleanup: async () => { } };
    const checkConfig = tempConfig.config;
    const browserConfig = parseBrowserConfigText(checkText);
    const detectedBrowsers = await detectInstalledBrowsers({
        commandRunner: checkConfig.commandRunner,
    });
    const status = buildBrowserStatusPayload({
        cliConfig: checkConfig,
        browserConfig,
        detectedBrowsers,
    });
    try {
        const args = buildKleinanzeigenArgs("diagnose", {}, checkConfig);
        const { diagnostics, parsed, result, stderr } = await invokeMiniclaw("diagnose", args, checkConfig, config);
        const failures = diagnostics
            .filter((entry) => entry.severity === "error")
            .map((entry) => entry.message);
        const warnings = diagnostics
            .filter((entry) => entry.severity === "warning")
            .map((entry) => entry.message);
        if (!parsed.ok) {
            failures.push("miniclaw returned invalid structured output");
        }
        const canUse = Boolean(parsed.ok &&
            parsed.result.status === "succeeded" &&
            result.ok);
        return {
            ok: canUse,
            operation: "browser_check",
            canUse,
            check: {
                status: canUse ? "passed" : "failed",
                summary: canUse
                    ? "browser config passed miniclaw diagnostics"
                    : "browser config failed miniclaw diagnostics",
                failures,
                warnings,
            },
            browser: status.browser,
            detectedBrowsers: status.detectedBrowsers,
            command: {
                executable: "miniclaw",
                args: redactArgs(args),
            },
            exitCode: result.exitCode,
            signal: result.signal,
            timedOut: result.timedOut,
            needsUserAction: false,
            stdout: "",
            stderr,
        };
    }
    finally {
        await tempConfig.cleanup();
    }
}
