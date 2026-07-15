import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { repositoryRoot } from "../config.js";
import type { JsonObject } from "../domain/types.js";
import { readJson } from "../shared/json.js";
import { runProcess } from "../shared/process.js";

export interface EngineResult {
  outputDirectory: string;
  artifacts: Record<string, JsonObject>;
  cleanup: () => Promise<void>;
}

async function loadArtifacts(
  directory: string,
): Promise<Record<string, JsonObject>> {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(
        async (file) =>
          [file, await readJson<JsonObject>(resolve(directory, file))] as const,
      ),
    ),
  );
}

export async function loadReferenceArtifacts(
  sourceDirectory: string,
): Promise<EngineResult> {
  return {
    outputDirectory: sourceDirectory,
    artifacts: await loadArtifacts(sourceDirectory),
    cleanup: async () => undefined,
  };
}

export async function runVerifiedExperimentEngine(
  version: string,
  platformPackage?: string,
): Promise<EngineResult> {
  const workspace = await mkdtemp(
    resolve(tmpdir(), "claude-code-schema-engine-"),
  );
  const experiments = resolve(workspace, "experiments");
  try {
    for (const name of ["version-2", "version-3", "version-4"]) {
      await cp(
        resolve(repositoryRoot, "experiments", name),
        resolve(experiments, name),
        {
          recursive: true,
          filter: (source) => !source.split("/").includes("output"),
        },
      );
    }
    const script = resolve(experiments, "version-4", "generate.mjs");
    const args = [script, "--version", version];
    if (platformPackage) args.push("--platform-package", platformPackage);
    const result = await runProcess(process.execPath, args, {
      cwd: workspace,
      timeoutMs: 10 * 60_000,
      maxOutputBytes: 64 * 1024 * 1024,
    });
    if (result.code !== 0) {
      throw new Error(
        `Verified V4 engine failed (${result.code ?? result.signal}):\n${result.stderr}\n${result.stdout}`,
      );
    }
    const outputDirectory = resolve(experiments, "version-4", "output");
    return {
      outputDirectory,
      artifacts: await loadArtifacts(outputDirectory),
      cleanup: async () => rm(workspace, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
}
