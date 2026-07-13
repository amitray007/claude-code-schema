import type { JsonObject, JsonValue } from "../domain/types.js";

export function schemaFromValue(value: JsonValue): JsonObject {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const itemSchemas = value.map(schemaFromValue);
    const unique = [
      ...new Map(
        itemSchemas.map((schema) => [JSON.stringify(schema), schema]),
      ).values(),
    ];
    return {
      type: "array",
      ...(unique.length === 1
        ? { items: unique[0] }
        : unique.length
          ? { items: { anyOf: unique } }
          : {}),
    };
  }
  if (typeof value === "object") {
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
          name,
          schemaFromValue(child ?? null),
        ]),
      ),
      additionalProperties: true,
    };
  }
  return {
    type:
      typeof value === "number"
        ? Number.isInteger(value)
          ? "integer"
          : "number"
        : typeof value,
  };
}

export function mergeSchema(
  left: JsonObject = {},
  right: JsonObject = {},
): JsonObject {
  const merged: JsonObject = { ...left, ...right };
  if (left.properties || right.properties) {
    const leftProperties = (left.properties ?? {}) as JsonObject;
    const rightProperties = (right.properties ?? {}) as JsonObject;
    const properties: JsonObject = { ...leftProperties };
    for (const [name, schema] of Object.entries(rightProperties)) {
      properties[name] = mergeSchema(
        (properties[name] ?? {}) as JsonObject,
        (schema ?? {}) as JsonObject,
      );
    }
    merged.properties = properties;
  }
  return merged;
}

export function setDottedProperty(
  rootProperties: JsonObject,
  dottedPath: string,
  schema: JsonObject,
): void {
  const parts = dottedPath.split(".").filter(Boolean);
  if (!parts.length) throw new Error("A dotted property path cannot be empty");
  let properties = rootProperties;
  for (const part of parts.slice(0, -1)) {
    properties[part] = mergeSchema((properties[part] ?? {}) as JsonObject, {
      type: "object",
      properties: {},
      additionalProperties: true,
    });
    properties = properties[part]!.properties as JsonObject;
  }
  const leaf = parts.at(-1)!;
  properties[leaf] = mergeSchema(
    (properties[leaf] ?? {}) as JsonObject,
    schema,
  );
}

export function withEvidence(
  schema: JsonObject,
  evidence: JsonValue[],
): JsonObject {
  return {
    ...schema,
    "x-type-status":
      schema.type || schema.enum ? "independently-derived" : "unverified",
    "x-provenance": { evidence },
  };
}
