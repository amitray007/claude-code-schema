import { activeForVersion } from "./markdown.mjs";
import { schemaFromValue, withEvidence } from "./schema.mjs";

// Accept only explicit type labels and complete lists of string literals.
// Prose mentioning a type or a few example values is not a type declaration.
export function schemaFromDocumentedType(display = "") {
  const text = display.trim();
  const primitive = /^(string|boolean|number|integer|object|array)$/i.exec(text);
  if (primitive) return { type: primitive[1].toLowerCase() };
  const stringEnum = /^string,\s*(`"[^"\\]*"`(?:\s*(?:,\s*(?:or\s+)?|or\s+)`"[^"\\]*"`)*)$/i.exec(text);
  if (!stringEnum) return {};
  return {
    type: "string",
    enum: [...new Set([...stringEnum[1].matchAll(/`("[^"\\]*")`/g)].map((match) => JSON.parse(match[1])))]
  };
}

export function settingRecord(section, source, version) {
  if (!activeForVersion(section.bounds, version)) return null;
  // The reference page states each key's scope directly, so trust that label
  // instead of inferring scope from description prose.
  if (!section.scopes) throw new Error(`${source.id}: unknown scope "${section.scopeLabel}" for ${section.key}`);
  const example = parseJsonExampleBlock(section.example, section.key);
  const typeSchema = schemaFromDocumentedType(section.type);
  return {
    key: section.key,
    heading: section.heading,
    bounds: section.bounds,
    example,
    typeSchema,
    scopes: section.scopes,
    evidence: [{
      source: source.id,
      sourceSha256: source.sha256,
      heading: section.heading,
      fact: example.parsed ? "existence-and-example" : typeSchema.type ? "existence-and-type" : "existence",
      method: "official-key-entry"
    }]
  };
}

// A key's example is a whole settings.json object, so take the value stored at
// the key itself rather than the surrounding wrapper.
function parseJsonExampleBlock(block, key) {
  if (!block) return { parsed: false };
  let document;
  try {
    document = JSON.parse(block);
  } catch {
    return { parsed: false, display: block.trim() };
  }
  let cursor = document;
  for (const part of key.split(".")) {
    if (cursor === null || typeof cursor !== "object" || !(part in cursor)) {
      return { parsed: false, display: block.trim() };
    }
    cursor = cursor[part];
  }
  return { parsed: true, value: cursor };
}

export function schemaForRecord(record) {
  const base = record.example.parsed ? schemaFromValue(record.example.value) : record.typeSchema;
  return withEvidence({
    ...base,
    ...(record.bounds.minVersion ? { "x-min-version": record.bounds.minVersion } : {}),
    ...(record.bounds.maxVersion ? { "x-max-version": record.bounds.maxVersion } : {}),
    ...(record.example.parsed ? { examples: [record.example.value] } : {}),
    ...(record.scopes.length < 5 ? { "x-scopes": record.scopes } : {})
  }, record.evidence);
}

