import fs from "node:fs/promises";
import path from "node:path";

export function mockResultLine(command, status = "succeeded", fields = {}) {
  return `console.log(${JSON.stringify(JSON.stringify({
    schemaVersion: 1,
    command,
    status,
    ...fields,
  }))});`;
}

export async function writeScopedAdFixture(
  tmp,
  yaml = "active: true\ntitle: Sample Listing\n",
) {
  const adRoot = path.join(tmp, "ads");
  const adDir = path.join(adRoot, "sample-listing");
  const adPath = path.join(adDir, "ad.yaml");
  const configPath = path.join(tmp, "config.yaml");
  await fs.mkdir(adDir, { recursive: true });
  await fs.writeFile(adPath, yaml, "utf8");
  await fs.writeFile(
    configPath,
    `ad_files:\n  - ${JSON.stringify(adPath)}\n`,
    "utf8",
  );
  return { adDir, adPath, adRoot, configPath };
}
