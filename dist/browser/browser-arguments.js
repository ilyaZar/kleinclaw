/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export function remoteDebuggingHostFromArguments(args) {
    for (const arg of args) {
        if (arg.startsWith("--remote-debugging-host=")) {
            return arg.split("=", 2)[1] ?? "127.0.0.1";
        }
    }
    return "127.0.0.1";
}
export function remoteDebuggingPortFromArguments(args) {
    for (const arg of args) {
        if (!arg.startsWith("--remote-debugging-port=")) {
            continue;
        }
        const value = Number(arg.split("=", 2)[1]);
        if (Number.isInteger(value) && value > 0) {
            return value;
        }
    }
    return null;
}
