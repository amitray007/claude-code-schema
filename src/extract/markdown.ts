import type { JsonValue } from "../domain/types.js";

const VERSION_MARKER =
  /\{\/\*\s*(min|max)-version:\s*([0-9]+(?:\.[0-9]+)*)\s*\*\/\}/g;

export interface MarkdownTable {
  heading: string;
  header: string[];
  rows: string[][];
}

export interface VersionBounds {
  minVersion?: string;
  maxVersion?: string;
}

export type ParsedExample =
  { parsed: true; value: JsonValue } | { parsed: false; display?: string };

export function stripMarkdown(value: string): string {
  return value.replace(VERSION_MARKER, "").replace(/^`|`$/g, "").trim();
}

export function splitMarkdownRow(line: string): string[] {
  if (!line.startsWith("|") || !line.endsWith("|"))
    throw new Error("Markdown table rows must start and end with a pipe");
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  let codeDelimiter = 0;
  for (let index = 1; index < line.length - 1; index += 1) {
    const character = line[index]!;
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
      codeDelimiter = codeDelimiter === run ? 0 : codeDelimiter || run;
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

export function markdownTables(markdown: string): MarkdownTable[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const tables: MarkdownTable[] = [];
  let heading = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch?.[2]) heading = stripMarkdown(headingMatch[2]);
    if (!line.startsWith("|")) continue;
    const header = splitMarkdownRow(line);
    const next = lines[index + 1];
    const separator = next?.startsWith("|") ? splitMarkdownRow(next) : [];
    if (
      !separator.length ||
      !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    )
      continue;
    const rows: string[][] = [];
    index += 2;
    while (index < lines.length && lines[index]!.startsWith("|")) {
      const cells = splitMarkdownRow(lines[index]!);
      if (cells.length === header.length) rows.push(cells);
      index += 1;
    }
    index -= 1;
    tables.push({ heading, header, rows });
  }
  return tables;
}

export function tableRecords(table: MarkdownTable): Record<string, string>[] {
  const headers = table.header.map((value) =>
    stripMarkdown(value).toLowerCase(),
  );
  return table.rows.map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? ""]),
    ),
  );
}

export function keyFromCell(cell?: string): string | null {
  return /^`([^`]+)`/.exec(cell?.trim() ?? "")?.[1] ?? null;
}

export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function versionBounds(text: string): VersionBounds {
  const result: VersionBounds = {};
  for (const match of text.matchAll(VERSION_MARKER)) {
    const value = match[2];
    if (!value) continue;
    if (match[1] === "min") result.minVersion = value;
    else result.maxVersion = value;
  }
  return result;
}

export function activeForVersion(
  record: VersionBounds,
  version: string,
): boolean {
  if (record.minVersion && compareVersions(version, record.minVersion) < 0)
    return false;
  if (record.maxVersion && compareVersions(version, record.maxVersion) > 0)
    return false;
  return true;
}

export function parseJsonExample(cell?: string): ParsedExample {
  if (!cell) return { parsed: false };
  let value = stripMarkdown(cell).replace(/&quot;/g, '"');
  if (/^(?:\/|~\/|\.\/)/.test(value)) value = JSON.stringify(value);
  try {
    return { parsed: true, value: JSON.parse(value) as JsonValue };
  } catch {
    return { parsed: false, display: stripMarkdown(cell) };
  }
}
