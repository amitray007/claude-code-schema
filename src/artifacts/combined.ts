import {
  combinedSchemaFile,
  generatorVersion,
  surfaceSchemaFiles,
} from "../config.js";
import type { JsonObject } from "../domain/types.js";

const surfaceNames: Record<(typeof surfaceSchemaFiles)[number], string> = {
  "settings.schema.json": "settings",
  "global-config.schema.json": "globalConfig",
  "desktop-managed-settings.schema.json": "desktopManagedSettings",
  "env.schema.json": "environment",
  "keybindings.schema.json": "keybindings",
};

export function combinedSchema(version: string, baseUrl: string): JsonObject {
  const properties = Object.fromEntries(
    surfaceSchemaFiles.map((file) => [
      surfaceNames[file],
      {
        $ref: file,
        description: `Instance validated by ${file}`,
      },
    ]),
  );
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: `${baseUrl}/${version}/${combinedSchemaFile}`,
    title: `Claude Code ${version} configuration-surface envelope`,
    description:
      "A tooling envelope that validates all supported Claude Code configuration surfaces together. This object is not itself a file consumed by Claude Code.",
    type: "object",
    required: Object.values(surfaceNames),
    properties,
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
