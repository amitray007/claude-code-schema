#!/usr/bin/env node
import { resolve } from "node:path";
import { defaultBaseUrl, defaultOutputRoot } from "./config.js";
import { compareDirectories } from "./diff/compare.js";
import { discoverReleases } from "./discovery/npm.js";
import { generate } from "./pipeline/generate.js";
import { stagePublication } from "./publication/stage.js";
import { releaseIssueMarkdown } from "./reports/issue.js";
import { jsonText, readJson, writeJson } from "./shared/json.js";
import type {
  JsonObject,
  SurfaceManifest,
  ValidationReport,
} from "./domain/types.js";
import { validateDirectory } from "./validation/validate.js";

interface ParsedArguments {
  command: string;
  options: Map<string, string | true>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const [command = "help", ...rest] = argv;
  const options = new Map<string, string | true>();
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (!name?.startsWith("--"))
      throw new Error(`Unexpected positional argument: ${name}`);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(name, next);
      index += 1;
    } else {
      options.set(name, true);
    }
  }
  return { command, options };
}

function option(
  args: ParsedArguments,
  name: string,
  fallback?: string,
): string | undefined {
  const value = args.options.get(name);
  if (value === true) throw new Error(`${name} requires a value`);
  return value ?? fallback;
}

function requireOption(args: ParsedArguments, name: string): string {
  const value = option(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function rejectUnknown(args: ParsedArguments, allowed: string[]): void {
  const known = new Set(allowed);
  for (const name of args.options.keys())
    if (!known.has(name)) throw new Error(`Unknown option: ${name}`);
}

function usage(): string {
  return `claude-code-schema

Commands:
  generate  [--version VERSION] [--output DIR] [--base-url URL]
            [--platform-package PACKAGE] [--source DIR]
  validate  --directory DIR [--report FILE]
  diff      --from DIR --to DIR [--output FILE]
  discover  [--after VERSION] [--output FILE]
  issue     --directory DIR [--diff FILE] [--workflow-url URL] [--output FILE]
  stage     --candidate DIR --publication-root DIR
`;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.command === "help" || args.options.has("--help")) {
    process.stdout.write(usage());
    return;
  }

  if (args.command === "generate") {
    rejectUnknown(args, [
      "--version",
      "--output",
      "--base-url",
      "--platform-package",
      "--source",
    ]);
    const version = option(args, "--version", "latest")!;
    const outputDirectory = resolve(
      option(args, "--output", resolve(defaultOutputRoot, version))!,
    );
    const sourceDirectory = option(args, "--source");
    const platformPackage = option(args, "--platform-package");
    const result = await generate({
      version,
      outputDirectory,
      baseUrl: option(args, "--base-url", defaultBaseUrl)!,
      ...(sourceDirectory ? { sourceDirectory: resolve(sourceDirectory) } : {}),
      ...(platformPackage ? { platformPackage } : {}),
    });
    process.stdout.write(jsonText(result));
    return;
  }

  if (args.command === "validate") {
    rejectUnknown(args, ["--directory", "--report"]);
    const report = await validateDirectory(
      resolve(requireOption(args, "--directory")),
    );
    const reportFile = option(args, "--report");
    if (reportFile) await writeJson(resolve(reportFile), report);
    process.stdout.write(jsonText(report));
    return;
  }

  if (args.command === "diff") {
    rejectUnknown(args, ["--from", "--to", "--output"]);
    const result = await compareDirectories(
      resolve(requireOption(args, "--from")),
      resolve(requireOption(args, "--to")),
    );
    const outputFile = option(args, "--output");
    if (outputFile) await writeJson(resolve(outputFile), result);
    process.stdout.write(jsonText(result));
    return;
  }

  if (args.command === "discover") {
    rejectUnknown(args, ["--after", "--output"]);
    const result = await discoverReleases(option(args, "--after"));
    const outputFile = option(args, "--output");
    if (outputFile) await writeJson(resolve(outputFile), result);
    process.stdout.write(jsonText(result));
    return;
  }

  if (args.command === "issue") {
    rejectUnknown(args, [
      "--directory",
      "--diff",
      "--workflow-url",
      "--output",
    ]);
    const directory = resolve(requireOption(args, "--directory"));
    const [manifest, validation] = await Promise.all([
      readJson<SurfaceManifest>(resolve(directory, "manifest.json")),
      readJson<ValidationReport>(resolve(directory, "validation-report.json")),
    ]);
    const diffFile = option(args, "--diff");
    const diff = diffFile
      ? await readJson<JsonObject>(resolve(diffFile))
      : undefined;
    const markdown = releaseIssueMarkdown(
      manifest,
      validation,
      diff,
      option(args, "--workflow-url"),
    );
    const outputFile = option(args, "--output");
    if (outputFile)
      await import("node:fs/promises").then(({ writeFile }) =>
        writeFile(resolve(outputFile), markdown),
      );
    process.stdout.write(markdown);
    return;
  }

  if (args.command === "stage") {
    rejectUnknown(args, ["--candidate", "--publication-root"]);
    const result = await stagePublication(
      resolve(requireOption(args, "--candidate")),
      resolve(requireOption(args, "--publication-root")),
    );
    process.stdout.write(jsonText(result));
    return;
  }

  throw new Error(`Unknown command: ${args.command}\n\n${usage()}`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
