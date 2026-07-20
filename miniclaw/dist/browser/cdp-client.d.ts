export interface JsonTarget {
    id?: string;
    type?: string;
    url?: string;
    webSocketDebuggerUrl?: string;
}
export interface CdpRemoteObject {
    objectId?: string;
    subtype?: string;
    type?: string;
    unserializableValue?: string;
    value?: unknown;
}
export interface CdpCommandResult {
    result?: CdpRemoteObject;
    exceptionDetails?: {
        text?: string;
        exception?: {
            description?: string;
            value?: unknown;
        };
    };
    [key: string]: unknown;
}
type CdpEventHandler = (params: Record<string, unknown>) => void;
export declare const CDP_POLL_MS = 100;
export declare function sleep(ms: number): Promise<void>;
export declare function timeoutError(message: string): Error;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function fetchJson<T>(url: string, { method, timeoutMs, }?: {
    method?: string;
    timeoutMs?: number;
}): Promise<T>;
export declare function cdpValue(result: CdpRemoteObject | undefined): unknown;
export declare function throwCdpException(response: CdpCommandResult, fallback: string): void;
export declare class CdpClient {
    private readonly webSocketUrl;
    private readonly defaultTimeoutMs;
    private nextId;
    private socket;
    private readonly eventHandlers;
    private readonly pending;
    constructor(webSocketUrl: string, defaultTimeoutMs?: number);
    connect(): Promise<void>;
    close(): void;
    on(method: string, handler: CdpEventHandler): () => void;
    send(method: string, params?: Record<string, unknown>, { timeoutMs }?: {
        timeoutMs?: number;
    }): Promise<CdpCommandResult>;
    private handleMessage;
    private rejectAll;
}
export {};
