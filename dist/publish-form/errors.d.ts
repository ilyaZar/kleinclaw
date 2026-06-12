export declare class CategoryResolutionError extends Error {
    constructor(message: string);
}
export declare class CaptchaEncountered extends Error {
    readonly restartDelaySeconds: number | null;
    constructor(restartDelaySeconds?: number | null);
}
export declare class PublishSubmissionUncertainError extends Error {
    constructor(message?: string);
}
