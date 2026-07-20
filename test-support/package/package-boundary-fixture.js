import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);
export const allowedDependencies = {
  "decimal.js": "^10.6.0",
  glob: "^13.0.6",
  yaml: "^2.9.0",
};
export const allowedDevDependencies = {
  "@types/node": "^22.19.21",
  typescript: "^6.0.3",
};

export async function npmPackDryRunFiles() {
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      cwd: process.cwd(),
      maxBuffer: 4_000_000,
    },
  );
  const [pack] = JSON.parse(stdout);
  return new Set(pack.files.map((entry) => entry.path));
}

export async function linkRuntimeDependencies(root) {
  const nodeModules = path.join(root, "node_modules");
  await fs.mkdir(nodeModules, { recursive: true });
  for (const dependency of Object.keys(allowedDependencies)) {
    await fs.symlink(
      path.join(process.cwd(), "node_modules", dependency),
      path.join(nodeModules, dependency),
      "dir",
    );
  }
}
