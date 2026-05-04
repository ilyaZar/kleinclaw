import { spawn } from "node:child_process";

export function createNodeCommandRunner() {
  return (argv, options = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(argv[0], argv.slice(1), {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;

      const finish = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 2000).unref();
      }, options.timeoutMs ?? 120000);
      timer.unref();

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code, signal) => {
        finish({
          stdout,
          stderr,
          code,
          signal,
          killed: child.killed,
          termination: timedOut ? "timeout" : signal ? "signal" : "exit",
          noOutputTimedOut: false,
        });
      });
    });
}

export function withCommandRunner(config = {}) {
  return {
    commandRunner: createNodeCommandRunner(),
    ...config,
  };
}
