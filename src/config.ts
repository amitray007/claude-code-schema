import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const compiledSourceDirectory = dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = resolve(compiledSourceDirectory, "../..");
export const generatorVersion = "0.1.0";
export const repositorySlug = "amitray007/claude-code-schema";
export const defaultBaseUrl = `https://github.com/${repositorySlug}/releases/download`;
export const defaultOutputRoot = resolve(repositoryRoot, "generated");
export const releasePackageName = "@anthropic-ai/claude-code";

export function releaseVersionBaseUrl(
  baseUrl: string,
  version: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/v${version}`;
}

export const surfaceSchemaFiles = [
  "settings.schema.json",
  "global-config.schema.json",
  "desktop-managed-settings.schema.json",
  "env.schema.json",
  "keybindings.schema.json",
] as const;

export const combinedSchemaFile = "claude-code.schema.json";
