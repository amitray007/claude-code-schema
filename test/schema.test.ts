import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeSchema,
  schemaFromValue,
  setDottedProperty,
  withEvidence,
} from "../src/schema/infer.js";
import type { JsonObject } from "../src/domain/types.js";

test("schema inference covers scalar, array, mixed array, and object values", () => {
  assert.deepEqual(schemaFromValue(2), { type: "integer" });
  assert.deepEqual(schemaFromValue(2.5), { type: "number" });
  assert.deepEqual(schemaFromValue(["a", "b"]), {
    type: "array",
    items: { type: "string" },
  });
  assert.deepEqual(schemaFromValue(["a", 1]), {
    type: "array",
    items: { anyOf: [{ type: "string" }, { type: "integer" }] },
  });
  assert.deepEqual(schemaFromValue({ enabled: true }), {
    type: "object",
    properties: { enabled: { type: "boolean" } },
    additionalProperties: true,
  });
});

test("schema merging preserves nested properties", () => {
  assert.deepEqual(
    mergeSchema(
      { type: "object", properties: { left: { type: "string" } } },
      { properties: { right: { type: "boolean" } } },
    ),
    {
      type: "object",
      properties: { left: { type: "string" }, right: { type: "boolean" } },
    },
  );
});

test("dotted properties construct open intermediate objects", () => {
  const properties: JsonObject = {};
  setDottedProperty(properties, "permissions.defaultMode", { type: "string" });
  assert.equal((properties.permissions as JsonObject).type, "object");
  assert.deepEqual(
    ((properties.permissions as JsonObject).properties as JsonObject)
      .defaultMode,
    { type: "string" },
  );
  assert.throws(() => setDottedProperty(properties, "", {}), /cannot be empty/);
});

test("evidence annotations distinguish typed and unverified facts", () => {
  assert.equal(
    withEvidence({ type: "string" }, ["docs"])["x-type-status"],
    "independently-derived",
  );
  assert.equal(withEvidence({}, ["docs"])["x-type-status"], "unverified");
});
