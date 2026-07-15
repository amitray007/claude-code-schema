import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { GenerationOptions, GenerationResult } from "../domain/types.js";
import { normalizeArtifacts } from "../artifacts/normalize.js";
import { replaceDirectory, writeJson } from "../shared/json.js";
import { validateDirectory } from "../validation/validate.js";
import {
  loadReferenceArtifacts,
  runVerifiedExperimentEngine,
} from "./engine.js";

export async function generate(
  options: GenerationOptions,
): Promise<GenerationResult> {
  const engine = options.sourceDirectory
    ? await loadReferenceArtifacts(options.sourceDirectory)
    : await runVerifiedExperimentEngine(
        options.version,
        options.platformPackage,
      );
  const parent = dirname(options.outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(
    resolve(parent, ".claude-code-schema-candidate-"),
  );
  try {
    const { artifacts, manifest } = normalizeArtifacts(
      engine.artifacts,
      options.baseUrl,
    );
    for (const [file, payload] of Object.entries(artifacts))
      await writeJson(resolve(staging, file), payload);
    const validation = await validateDirectory(staging);
    await writeJson(resolve(staging, "validation-report.json"), validation);
    await replaceDirectory(staging, options.outputDirectory);
    return {
      version: manifest.claudeCodeVersion,
      outputDirectory: options.outputDirectory,
      manifest,
      validation,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
    await engine.cleanup();
  }
}
