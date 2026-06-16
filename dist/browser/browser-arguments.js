/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export function remoteDebuggingHostFromArguments(args) {
    for (const arg of args) {
        if (arg.startsWith("--remote-debugging-host=")) {
            const host = arg.split("=", 2)[1]?.trim() ?? "127.0.0.1";
            if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
                throw new Error(`Invalid --remote-debugging-host value: ${host}. Use localhost only.`);
            }
            return host;
        }
    }
    return "127.0.0.1";
}
export function remoteDebuggingPortFromArguments(args) {
    for (const arg of args) {
        if (!arg.startsWith("--remote-debugging-port=")) {
            continue;
        }
        const raw = arg.split("=", 2)[1] ?? "";
        const valueText = raw.trim();
        if (!/^[+-]?\d+$/.test(valueText)) {
            throw new Error(`Invalid --remote-debugging-port value: ${raw}`);
        }
        const value = Number(valueText);
        if (value > 0) {
            return value;
        }
    }
    return null;
}
