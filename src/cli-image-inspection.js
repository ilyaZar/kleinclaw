import fs from "node:fs/promises";
import path from "node:path";

import { displayPathForAd, localSuccessProcessFields } from "./cli-ad-catalog.js";
import { pathIsInside, realPath, resolveWritableAdDirectory } from "./cli-ad-paths.js";
import { normalizePositiveInteger } from "./input.js";

const SUPPORTED_IMAGE_EXTENSIONS = new Set([".gif", ".jpg", ".jpeg", ".png"]);
const IMAGE_FILE_EXTENSIONS = new Set([
  ...SUPPORTED_IMAGE_EXTENSIONS, ".webp", ".avif", ".heic",
]);

function imageDimensionsFromBuffer(buffer, extension) {
  if (extension === ".png" && buffer.length >= 24) {
    const signature = buffer.subarray(0, 8).toString("hex");
    if (signature === "89504e470d0a1a0a") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
  }
  if (extension === ".gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if ([".jpg", ".jpeg"].includes(extension) && buffer.length >= 4) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) {
        break;
      }
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + length;
    }
  }
  return { width: null, height: null };
}

async function inspectImageFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(stat.size, 65536));
    await handle.read(buffer, 0, buffer.length, 0);
    return {
      extension,
      supportedByMiniclaw: SUPPORTED_IMAGE_EXTENSIONS.has(extension),
      bytes: stat.size,
      ...imageDimensionsFromBuffer(buffer, extension),
    };
  } finally {
    await handle.close();
  }
}

export async function listKleinanzeigenImages(params = {}, config = {}) {
  const maxResults = normalizePositiveInteger(params.maxResults, 100, 1, 500);
  const maxDepth = normalizePositiveInteger(params.maxDepth, 2, 0, 6);
  const { directory, root } = await resolveWritableAdDirectory(params.directory, config);
  const directoryStat = await fs.stat(directory);
  if (!directoryStat.isDirectory()) {
    throw new Error("directory is not a directory");
  }
  const resolvedDirectory = await realPath(directory);
  if (!pathIsInside(resolvedDirectory, root)) {
    throw new Error("directory is outside configured adRoots");
  }

  const images = [];
  async function visit(current, depth) {
    if (images.length >= maxResults || depth > maxDepth) {
      return;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (images.length >= maxResults) {
        return;
      }
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory() && depth < maxDepth) {
        await visit(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!IMAGE_FILE_EXTENSIONS.has(extension)) {
        continue;
      }
      const info = await inspectImageFile(fullPath);
      images.push({
        file: path.relative(resolvedDirectory, fullPath),
        adRootPath: displayPathForAd(fullPath, root),
        glob: path.relative(resolvedDirectory, fullPath),
        ...info,
      });
    }
  }

  await visit(resolvedDirectory, 0);
  return {
    ok: true,
    operation: "images_list",
    directory: displayPathForAd(resolvedDirectory, root),
    count: images.length,
    images,
    ...localSuccessProcessFields(),
  };
}
