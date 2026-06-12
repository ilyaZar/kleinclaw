/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

export interface BrowserConfigInput {
  arguments?: string[];
  binaryLocation?: string | null;
  binary_location?: string | null;
  extensions?: string[];
  usePrivateWindow?: boolean;
  use_private_window?: boolean;
  userDataDir?: string | null;
  user_data_dir?: string | null;
  profileName?: string | null;
  profile_name?: string | null;
}

export class BrowserConfig {
  readonly arguments: string[];
  readonly binaryLocation: string;
  readonly extensions: string[];
  readonly usePrivateWindow: boolean;
  readonly userDataDir: string;
  readonly profileName: string;

  constructor(input: BrowserConfigInput = {}) {
    this.arguments = [...(input.arguments ?? [])];
    this.binaryLocation = input.binaryLocation ?? input.binary_location ?? "";
    this.extensions = [...(input.extensions ?? [])];
    this.usePrivateWindow =
      input.usePrivateWindow ?? input.use_private_window ?? true;
    this.userDataDir = input.userDataDir ?? input.user_data_dir ?? "";
    this.profileName = input.profileName ?? input.profile_name ?? "";
  }
}

export interface LoginConfigInput {
  username?: string | null;
  password?: string | null;
}

export class LoginConfig {
  readonly username: string;
  readonly password: string;

  constructor(input: LoginConfigInput = {}) {
    this.username = input.username ?? "";
    this.password = input.password ?? "";
  }
}
