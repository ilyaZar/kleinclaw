export function stripYamlScalar(value) {
  const raw = String(value ?? "").trim();
  const withoutComment = raw.startsWith("#")
    ? ""
    : raw.replace(/\s+#.*$/, "").trim();
  if (
    (withoutComment.startsWith('"') && withoutComment.endsWith('"')) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}

export function quoteYamlScalar(value) {
  return JSON.stringify(String(value ?? ""));
}

export function findTopLevelYamlSection(lines, key) {
  const start = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));
  if (start === -1) {
    return null;
  }

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(line)) {
      break;
    }
    end += 1;
  }
  return { start, end };
}
