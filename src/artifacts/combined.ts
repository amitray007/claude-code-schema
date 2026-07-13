import {
  combinedSchemaFile,
  generatorVersion,
  releaseVersionBaseUrl,
  surfaceSchemaFiles,
} from "../config.js";
import type { JsonObject, JsonValue } from "../domain/types.js";
import { cloneJson } from "../shared/json.js";

const surfaceNames: Record<(typeof surfaceSchemaFiles)[number], string> = {
  "settings.schema.json": "settings",
  "global-config.schema.json": "globalConfig",
  "desktop-managed-settings.schema.json": "desktopManagedSettings",
  "environment.schema.json": "environment",
  "keybindings.schema.json": "keybindings",
};

function bundledSurface(schema: JsonObject, definition: string): JsonObject {
  const bundled = cloneJson(schema);
  delete bundled.$schema;
  delete bundled.$id;
  const definitionRef = `#/definitions/${definition}`;
  const rewriteLocalRefs = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) return value.map(rewriteLocalRefs);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => {
          if (key === "$ref" && typeof child === "string") {
            if (child === "#") return [key, definitionRef];
            if (child.startsWith("#/"))
              return [key, `${definitionRef}${child.slice(1)}`];
          }
          return [key, rewriteLocalRefs(child as JsonValue)];
        }),
      );
    }
    return value;
  };
  return rewriteLocalRefs(bundled) as JsonObject;
}

export function combinedSchema(
  version: string,
  baseUrl: string,
  surfaceSchemas: Record<string, JsonObject>,
): JsonObject {
  const versionBaseUrl = releaseVersionBaseUrl(baseUrl, version);
  const properties = Object.fromEntries(
    surfaceSchemaFiles.map((file) => [
      surfaceNames[file],
      {
        $ref: `#/definitions/${surfaceNames[file]}`,
        description: `Instance validated by ${file}`,
      },
    ]),
  );
  const definitions = Object.fromEntries(
    surfaceSchemaFiles.map((file) => {
      const schema = surfaceSchemas[file];
      if (!schema) throw new Error(`Cannot bundle missing schema: ${file}`);
      const name = surfaceNames[file];
      return [name, bundledSurface(schema, name)];
    }),
  );
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: `${versionBaseUrl}/${combinedSchemaFile}`,
    title: `Claude Code ${version} configuration-surface envelope`,
    description:
      "A tooling envelope that validates all supported Claude Code configuration surfaces together. This object is not itself a file consumed by Claude Code.",
    type: "object",
    required: Object.values(surfaceNames),
    properties,
    definitions,
    additionalProperties: false,
    examples: [
      {
        settings: {},
        globalConfig: {},
        desktopManagedSettings: {},
        environment: {},
        keybindings: { bindings: [] },
      },
    ],
    "x-claude-code-version": version,
    "x-artifact-kind": "combined-configuration-envelope-json-schema",
    "x-generator-version": generatorVersion,
    "x-surface-files": [...surfaceSchemaFiles],
  };
}
