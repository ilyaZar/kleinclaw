export type UpdateCheckChannel = "latest" | "preview";
export interface UpdateCheckConfigInput {
    enabled?: boolean;
    channel?: UpdateCheckChannel | string;
    interval?: string;
}
export declare class UpdateCheckConfig {
    readonly enabled: boolean;
    readonly channel: UpdateCheckChannel;
    readonly interval: string;
    constructor(input?: UpdateCheckConfigInput);
}
