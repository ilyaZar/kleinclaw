import fs from "node:fs/promises";

await Promise.all(
  ["dist", "miniclaw/dist"].map((directory) =>
    fs.rm(directory, { force: true, recursive: true })
  ),
);
