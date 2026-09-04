const VERSION_MARKER = /\{\/\*\s*(min|max)-version:\s*([0-9]+(?:\.[0-9]+)*)\s*\*\/\}/g;

export function stripMarkdown(value) {
  return value
    .replace(VERSION_MARKER, "")
    .replace(/^`|`$/g, "")
    .trim();
}

export function splitMarkdownRow(line) {
  const cells = [];
  let current = "";
  let escaped = false;
  let codeDelimiter = 0;
  for (let index = 1; index < line.length - 1; index += 1) {
    const character = line[index];
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      current += character;
      escaped = true;
    } else if (character === "`") {
      let run = 1;
      while (line[index + run] === "`") run += 1;
      current += "`".repeat(run);
      codeDelimiter = codeDelimiter === run ? 0 : (codeDelimiter || run);
      index += run - 1;
    } else if (character === "|" && codeDelimiter === 0) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function markdownTables(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const tables = [];
  let heading = "";
  for (let index = 0; index < lines.length; index += 1) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(lines[index]);
    if (headingMatch) heading = stripMarkdown(headingMatch[2]);
    if (!lines[index].startsWith("|")) continue;
    const header = splitMarkdownRow(lines[index]);
    const separator = lines[index + 1]?.startsWith("|")
      ? splitMarkdownRow(lines[index + 1])
      : [];
    if (!separator.length || !separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const rows = [];
    index += 2;
    while (index < lines.length && lines[index].startsWith("|")) {
      const cells = splitMarkdownRow(lines[index]);
      if (cells.length === header.length) rows.push(cells);
      index += 1;
    }
    index -= 1;
    tables.push({ heading, header, rows });
  }
  return tables;
}

export function tableRecords(table) {
  const headers = table.header.map((value) => stripMarkdown(value).toLowerCase());
  return table.rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]]))
  );
}

export function keyFromCell(cell) {
  return /^`([^`]+)`/.exec(cell?.trim() ?? "")?.[1] ?? null;
}

export function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function versionBounds(text) {
  const result = {};
  for (const match of text.matchAll(VERSION_MARKER)) {
    const key = match[1] === "min" ? "minVersion" : "maxVersion";
    result[key] = match[2];
  }
  return result;
}

export function activeForVersion(record, version) {
  if (record.minVersion && compareVersions(version, record.minVersion) < 0) return false;
  if (record.maxVersion && compareVersions(version, record.maxVersion) > 0) return false;
  return true;
}

export function parseJsonExample(cell) {
  if (!cell) return { parsed: false };
  let value = stripMarkdown(cell).replace(/&quot;/g, '"');
  if (/^(?:\/|~\/|\.\/)/.test(value)) value = JSON.stringify(value);
  try {
    return { parsed: true, value: JSON.parse(value) };
  } catch {
    return { parsed: false, display: stripMarkdown(cell) };
  }
}

const SCOPE_LABELS = {
  "Any file": ["user", "project", "local", "managed", "cli-settings"],
  "User, local, or managed": ["user", "local", "managed", "cli-settings"],
  "User or managed": ["user", "managed", "cli-settings"],
  Managed: ["managed"],
  "Global config": ["global-config"]
};

export function scopesFromLabel(label) {
  return SCOPE_LABELS[label] ?? null;
}

// The settings reference moved from one wide table to a per-key section for
// each key. Each section carries Scope, Type, and Default bullets plus a JSON
// example, so read the bullets rather than table columns.
export function referenceSections(markdown, startHeading) {
  const start = markdown.indexOf(startHeading);
  if (start === -1) throw new Error(`Could not find section ${startHeading}`);
  return markdown
    .slice(start)
    .replace(/\r/g, "")
    .split(/\n(?=### `)/)
    .filter((section) => section.startsWith("### `"))
    .map((section) => {
      const key = /^### `([^`]+)`/.exec(section)[1];
      const bullet = (name) =>
        new RegExp(`^\\*\\s+\\*\\*${name}\\*\\*:\\s*(.+)$`, "m").exec(section)?.[1]?.trim() ?? "";
      const scopeText = bullet("Scope");
      // Strip the doc link wrapper, then keep the leading label before any
      // explanatory prose that follows it.
      const scopeLabel = scopeText
        .replace(/\[`?([^\]`]+)`?\]\(#scopes\)/, "$1")
        .split(/\.(?:\s|$)/)[0]
        .trim();
      const removedIn = /Removed in v([0-9]+(?:\.[0-9]+)*)/.exec(section)?.[1] ?? null;
      return {
        key,
        section,
        heading: key,
        scopeLabel,
        scopes: scopesFromLabel(scopeLabel),
        type: bullet("Type"),
        default: bullet("Default"),
        example: /```json[^\n]*\n([\s\S]*?)```/.exec(section)?.[1] ?? null,
        bounds: removedIn ? { maxVersion: previousVersion(removedIn) } : {}
      };
    });
}

// "Removed in v2.1.257" means the key was last valid on the release before it.
function previousVersion(version) {
  const parts = version.split(".").map(Number);
  parts[parts.length - 1] -= 1;
  return parts.join(".");
}
