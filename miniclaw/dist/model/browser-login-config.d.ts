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
export declare class BrowserConfig {
    readonly arguments: string[];
    readonly binaryLocation: string;
    readonly extensions: string[];
    readonly usePrivateWindow: boolean;
    readonly userDataDir: string;
    readonly profileName: string;
    constructor(input?: BrowserConfigInput);
}
export interface LoginConfigInput {
    username?: string | null;
    password?: string | null;
}
export declare class LoginConfig {
    readonly username: string;
    readonly password: string;
    constructor(input?: LoginConfigInput);
}
