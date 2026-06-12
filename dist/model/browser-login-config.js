/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export class BrowserConfig {
    arguments;
    binaryLocation;
    extensions;
    usePrivateWindow;
    userDataDir;
    profileName;
    constructor(input = {}) {
        this.arguments = [...(input.arguments ?? [])];
        this.binaryLocation = input.binaryLocation ?? input.binary_location ?? "";
        this.extensions = [...(input.extensions ?? [])];
        this.usePrivateWindow =
            input.usePrivateWindow ?? input.use_private_window ?? true;
        this.userDataDir = input.userDataDir ?? input.user_data_dir ?? "";
        this.profileName = input.profileName ?? input.profile_name ?? "";
    }
}
export class LoginConfig {
    username;
    password;
    constructor(input = {}) {
        this.username = input.username ?? "";
        this.password = input.password ?? "";
    }
}
