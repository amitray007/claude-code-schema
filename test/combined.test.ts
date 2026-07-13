import assert from "node:assert/strict";
import test from "node:test";
import { combinedSchema } from "../src/artifacts/combined.js";
import { combinedSchemaFile, surfaceSchemaFiles } from "../src/config.js";
import type { JsonObject } from "../src/domain/types.js";

test("combined schema is an explicit five-surface tooling envelope", () => {
  const surfaceSchemas: Record<string, JsonObject> = Object.fromEntries(
    surfaceSchemaFiles.map((file) => [
      file,
      {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: `https://schemas.example.test/${file}`,
        type: "object",
      },
    ]),
  );
  surfaceSchemas["settings.schema.json"] = {
    ...surfaceSchemas["settings.schema.json"],
    definitions: { setting: { type: "string" } },
    properties: { setting: { $ref: "#/definitions/setting" } },
  };
  const schema = combinedSchema(
    "2.1.207",
    "https://schemas.example.test/claude-code",
    surfaceSchemas,
  );
  assert.equal(
    schema.$id,
    `https://schemas.example.test/claude-code/v2.1.207/${combinedSchemaFile}`,
  );
  assert.equal((schema.required as string[]).length, 5);
  assert.equal(schema.additionalProperties, false);
  assert.match(
    String(schema.description),
    /not itself a file consumed by Claude Code/,
  );
  const properties = schema.properties as JsonObject;
  assert.deepEqual(
    Object.values(properties).map((value) => (value as JsonObject).$ref),
    [
      "#/definitions/settings",
      "#/definitions/globalConfig",
      "#/definitions/desktopManagedSettings",
      "#/definitions/environment",
      "#/definitions/keybindings",
    ],
  );
  const definitions = schema.definitions as JsonObject;
  const settings = definitions.settings as JsonObject;
  assert.equal(settings.$id, undefined);
  assert.equal(settings.$schema, undefined);
  assert.deepEqual((settings.properties as JsonObject).setting, {
    $ref: "#/definitions/settings/definitions/setting",
  });
});
