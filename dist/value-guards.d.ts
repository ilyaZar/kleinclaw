export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function errorName(error: unknown): string | undefined;
export declare function errorMessage(error: unknown): string;
export declare function hasErrorName(error: unknown, name: string): boolean;
