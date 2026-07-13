import { cp, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { JsonObject, SurfaceManifest } from "../domain/types.js";
import {
  jsonSha256,
  readJson,
  replaceDirectory,
  writeJson,
} from "../shared/json.js";
import { validateDirectory } from "../validation/validate.js";

interface VersionIndex extends JsonObject {
  schemaVersion: number;
  latest: string;
  versions: JsonObject[];
}

async function copySelected(
  source: string,
  destination: string,
  files: string[],
): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const file of files)
    await cp(resolve(source, file), resolve(destination, file));
}

export async function stagePublication(
  candidateDirectory: string,
  publicationRoot: string,
): Promise<JsonObject> {
  await validateDirectory(candidateDirectory);
  const manifest = await readJson<SurfaceManifest>(
    resolve(candidateDirectory, "manifest.json"),
  );
  const hostedFiles = [
    ...Object.keys(manifest.artifacts).sort(),
    "manifest.json",
  ];
  const version = manifest.claudeCodeVersion;
  const latestDirectory = resolve(publicationRoot, "latest");
  await mkdir(publicationRoot, { recursive: true });
  const latestStaging = await mkdtemp(
    resolve(dirname(latestDirectory), ".latest-"),
  );
  for (const file of await readdir(candidateDirectory)) {
    if (file.endsWith(".json"))
      await cp(resolve(candidateDirectory, file), resolve(latestStaging, file));
  }
  await replaceDirectory(latestStaging, latestDirectory);

  const siteRoot = resolve(publicationRoot, "site", "claude-code");
  await mkdir(siteRoot, { recursive: true });
  const versionDirectory = resolve(siteRoot, version);
  const hostedLatestDirectory = resolve(siteRoot, "latest");
  await copySelected(candidateDirectory, versionDirectory, hostedFiles);
  const hostedLatestStaging = await mkdtemp(resolve(siteRoot, ".latest-"));
  await copySelected(candidateDirectory, hostedLatestStaging, hostedFiles);
  await replaceDirectory(hostedLatestStaging, hostedLatestDirectory);
  await validateDirectory(versionDirectory);
  await validateDirectory(hostedLatestDirectory);

  const indexFile = resolve(siteRoot, "index.json");
  let index: VersionIndex = { schemaVersion: 1, latest: version, versions: [] };
  try {
    index = await readJson<VersionIndex>(indexFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const entry: JsonObject = {
    version,
    path: `${version}/manifest.json`,
    manifestSha256: jsonSha256(manifest),
  };
  index.latest = version;
  index.versions = [
    ...index.versions.filter((value) => value.version !== version),
    entry,
  ].sort((left, right) =>
    String(left.version).localeCompare(String(right.version), undefined, {
      numeric: true,
    }),
  );
  await writeJson(indexFile, index);
  await Promise.all([
    writeJson(resolve(publicationRoot, "site", "index.json"), {
      schemaVersion: 1,
      service: "claude-code-schema",
      catalog: "claude-code/index.json",
      latestVersion: version,
    }),
    writeFile(resolve(publicationRoot, "site", ".nojekyll"), ""),
  ]);
  return {
    schemaVersion: 1,
    artifactKind: "publication-staging-report",
    version,
    latestDirectory,
    versionDirectory,
    hostedFiles,
    indexFile,
  };
}
