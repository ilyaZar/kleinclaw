import path from "node:path";
const ALLOWED_ENV_KEYS = new Set([
    "DBUS_SESSION_BUS_ADDRESS",
    "DISPLAY",
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_MESSAGES",
    "LOGNAME",
    "PATH",
    "SHELL",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USER",
    "WAYLAND_DISPLAY",
    "XAUTHORITY",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "XDG_STATE_HOME",
]);
const SECRET_ENV_RE = /(api|auth|cookie|credential|key|login|pass|secret|session|sms|token|user)/i;
const SENSITIVE_LINE_RE = new RegExp([
    "\\b(",
    "password|passwd|username|login|cookie|session|token|secret|credential",
    "|2fa|sms|user[_-]?data[_-]?dir|profile_name|browser profile",
    ")\\b",
].join(""), "i");
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
export function buildChildEnv(sourceEnv = process.env) {
    return Object.fromEntries(Object.entries(sourceEnv).filter(([key, value]) => ALLOWED_ENV_KEYS.has(key) &&
        !SECRET_ENV_RE.test(key) &&
        value !== undefined));
}
export function buildRedactions(config = {}) {
    const values = [];
    const add = (value) => {
        if (typeof value === "string" && value.trim()) {
            values.push(value.trim());
        }
    };
    add(config.workingDirectory);
    add(config.configPath);
    if (config.runtime && typeof config.runtime === "object") {
        const runtime = config.runtime;
        add(runtime.command);
        if (Array.isArray(runtime.argsPrefix)) {
            runtime.argsPrefix.forEach(add);
        }
    }
    if (Array.isArray(config.adFileOverrides)) {
        config.adFileOverrides.forEach(add);
    }
    if (Array.isArray(config.adRoots)) {
        config.adRoots.forEach(add);
    }
    if (typeof config.configPath === "string" && config.configPath.trim()) {
        const parent = path.dirname(config.configPath.trim());
        if (parent !== "." && parent !== path.parse(parent).root) {
            add(parent);
        }
    }
    return [...new Set(values)].sort((a, b) => b.length - a.length);
}
export function sanitizeText(text, redactions = [], maxChars = 6000) {
    const sanitized = String(text ?? "")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => {
        if (SENSITIVE_LINE_RE.test(line)) {
            return "[redacted sensitive line]";
        }
        let next = line.replace(EMAIL_RE, "[redacted-email]");
        for (const raw of redactions) {
            const value = String(raw).trim();
            if (value) {
                next = next.split(value).join("[redacted-path]");
            }
        }
        return next;
    })
        .join("\n")
        .trim();
    if (maxChars <= 0) {
        return "";
    }
    return sanitized.length <= maxChars
        ? sanitized
        : `${sanitized.slice(0, maxChars)}\n[truncated]`;
}
export function redactArgs(args = []) {
    return args.map((arg) => {
        if (arg.startsWith("--config=")) {
            return "--config=[redacted]";
        }
        if (arg === "--logfile=") {
            return arg;
        }
        if (arg.startsWith("--logfile=")) {
            return "--logfile=[redacted]";
        }
        return arg.startsWith("--ad-file=") ? "--ad-file=[redacted]" : arg;
    });
}
function failedProcess(error) {
    return {
        ok: false,
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error : new Error(String(error)),
        timedOut: false,
    };
}
export function runProcess(command, args, options = {}) {
    const maxChars = Number.isInteger(options.maxBufferChars)
        ? Math.max(options.maxBufferChars ?? 0, 0)
        : 20000;
    const cap = (value) => String(value ?? "").slice(0, maxChars + 1);
    if (!options.commandRunner) {
        return Promise.resolve(failedProcess(new Error("OpenClaw command runner is not available")));
    }
    return options.commandRunner([command, ...args], {
        cwd: options.cwd,
        env: options.env ?? buildChildEnv(),
        timeoutMs: options.timeoutMs ?? 120000,
    }).then((result) => {
        const timedOut = result.termination === "timeout" ||
            result.termination === "no-output-timeout";
        const exitCode = Number.isInteger(result.code) ? Number(result.code) : null;
        return {
            ok: exitCode === 0 && !timedOut,
            exitCode,
            signal: result.signal ?? null,
            stdout: cap(result.stdout),
            stderr: cap(result.stderr),
            timedOut,
        };
    }, failedProcess);
}
