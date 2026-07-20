import fs from "node:fs/promises";
import path from "node:path";

import {
  findTopLevelYamlSection, quoteYamlScalar, stripYamlScalar,
} from "./cli-yaml-text.js";

export function parseBrowserConfigText(text) {
  const config = {
    arguments: [],
    binary_location: "",
    use_private_window: true,
    user_data_dir: "",
    profile_name: "",
  };
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const section = findTopLevelYamlSection(lines, "browser");
  if (!section) {
    return { ...config, configured: false };
  }

  let currentKey = "";
  for (let index = section.start + 1; index < section.end; index += 1) {
    const line = lines[index];
    const direct = /^\s+([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (direct) {
      currentKey = direct[1];
      const value = stripYamlScalar(direct[2]);
      if (currentKey === "binary_location") {
        config.binary_location = value;
      } else if (currentKey === "use_private_window") {
        config.use_private_window = value === "true";
      } else if (currentKey === "user_data_dir") {
        config.user_data_dir = value;
      } else if (currentKey === "profile_name") {
        config.profile_name = value;
      } else if (currentKey === "arguments" && value === "[]") {
        config.arguments = [];
      }
      continue;
    }

    const listEntry = currentKey === "arguments"
      ? /^\s+-\s*(.+?)\s*$/.exec(line)
      : null;
    if (listEntry) {
      const value = stripYamlScalar(listEntry[1]);
      if (value) {
        config.arguments.push(value);
      }
    }
  }

  return { ...config, configured: true };
}

function scalarBrowserLine(indent, key, value) {
  const rendered = typeof value === "boolean" ? String(value) : quoteYamlScalar(value);
  return `${indent}${key}: ${rendered}`;
}

export function replaceBrowserYaml(content, updates) {
  const normalized = String(content ?? "").replace(/\r\n/g, "\n");
  const hadTrailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (hadTrailingNewline) {
    lines.pop();
  }

  let section = findTopLevelYamlSection(lines, "browser");
  if (!section) {
    lines.push(
      "",
      "browser:",
      "  arguments: []",
      "  binary_location: \"\"",
      "  extensions: []",
      "  use_private_window: true",
      "  user_data_dir: \"\"",
      "  profile_name: \"\"",
    );
    section = findTopLevelYamlSection(lines, "browser");
  }

  const existingChild = lines
    .slice(section.start + 1, section.end)
    .map((line) => /^(\s+)[A-Za-z_][A-Za-z0-9_-]*\s*:/.exec(line)?.[1])
    .find(Boolean);
  const indent = existingChild ?? "  ";

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }

    let replaced = false;
    for (let index = section.start + 1; index < section.end; index += 1) {
      if (new RegExp(`^\\s+${key}\\s*:`).test(lines[index])) {
        lines[index] = scalarBrowserLine(indent, key, value);
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      lines.splice(section.end, 0, scalarBrowserLine(indent, key, value));
      section.end += 1;
    }
  }

  return `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`;
}

export async function writeFileAtomic(filePath, content, mode) {
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath);
  const tmp = path.join(
    directory,
    `.${basename}.kleinclaw-${process.pid}-${Date.now()}.tmp`,
  );
  try {
    await fs.writeFile(tmp, content, { encoding: "utf8", mode });
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

export async function createTemporaryConfig(
  cliConfig,
  content,
  ext = path.extname(cliConfig.configPath).toLowerCase(),
) {
  const configDir = path.dirname(cliConfig.configPath);
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const configPath = path.join(
    configDir,
    `.kleinclaw-${suffix}${ext === ".json" ? ".json" : ".yaml"}`,
  );
  await fs.writeFile(configPath, content, { encoding: "utf8", mode: 0o600 });

  return {
    config: { ...cliConfig, configPath, cwd: configDir },
    cleanup: () => fs.rm(configPath, { force: true }),
  };
}
