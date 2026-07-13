export function schemaFromValue(value) {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const itemSchemas = value.map(schemaFromValue);
    const unique = [...new Map(itemSchemas.map((schema) => [JSON.stringify(schema), schema])).values()];
    return {
      type: "array",
      ...(unique.length === 1 ? { items: unique[0] } : unique.length ? { items: { anyOf: unique } } : {})
    };
  }
  if (typeof value === "object") {
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, schemaFromValue(child)])
      ),
      additionalProperties: true
    };
  }
  return { type: typeof value === "number" ? (Number.isInteger(value) ? "integer" : "number") : typeof value };
}

export function mergeSchema(left = {}, right = {}) {
  const merged = { ...left, ...right };
  if (left.properties || right.properties) {
    merged.properties = { ...(left.properties ?? {}) };
    for (const [name, schema] of Object.entries(right.properties ?? {})) {
      merged.properties[name] = mergeSchema(merged.properties[name], schema);
    }
  }
  return merged;
}

export function setDottedProperty(rootProperties, dottedPath, schema) {
  const parts = dottedPath.split(".");
  let properties = rootProperties;
  for (const part of parts.slice(0, -1)) {
    properties[part] = mergeSchema(properties[part], {
      type: "object",
      properties: {},
      additionalProperties: true
    });
    properties = properties[part].properties;
  }
  const leaf = parts.at(-1);
  properties[leaf] = mergeSchema(properties[leaf], schema);
}

export function withEvidence(schema, evidence) {
  return {
    ...schema,
    "x-type-status": schema.type || schema.enum ? "independently-derived" : "unverified",
    "x-provenance": { evidence }
  };
}
