import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const compiledSourceDirectory = dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = resolve(compiledSourceDirectory, "../..");
export const generatorVersion = "0.1.0";
export const defaultBaseUrl =
  "https://amitray007.github.io/claude-code-schema/claude-code";
export const defaultOutputRoot = resolve(repositoryRoot, "generated");
export const releasePackageName = "@anthropic-ai/claude-code";

export const surfaceSchemaFiles = [
  "settings.schema.json",
  "global-config.schema.json",
  "desktop-managed-settings.schema.json",
  "env.schema.json",
  "keybindings.schema.json",
] as const;

export const combinedSchemaFile = "claude-code.schema.json";
