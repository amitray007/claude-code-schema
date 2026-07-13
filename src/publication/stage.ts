import { cp, mkdir, mkdtemp, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { JsonObject, SurfaceManifest } from "../domain/types.js";
import { readJson, replaceDirectory } from "../shared/json.js";
import { validateDirectory } from "../validation/validate.js";

export async function stagePublication(
  candidateDirectory: string,
  publicationRoot: string,
): Promise<JsonObject> {
  await validateDirectory(candidateDirectory);
  const manifest = await readJson<SurfaceManifest>(
    resolve(candidateDirectory, "manifest.json"),
  );
  const version = manifest.claudeCodeVersion;
  const outputDirectory = resolve(publicationRoot, "output");
  await mkdir(publicationRoot, { recursive: true });
  const staging = await mkdtemp(resolve(dirname(outputDirectory), ".output-"));
  const files = (await readdir(candidateDirectory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  for (const file of files)
    await cp(resolve(candidateDirectory, file), resolve(staging, file));
  await validateDirectory(staging);
  await replaceDirectory(staging, outputDirectory);
  return {
    schemaVersion: 1,
    artifactKind: "publication-staging-report",
    version,
    tag: `v${version}`,
    outputDirectory,
    files,
  };
}
