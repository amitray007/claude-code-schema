import { releasePackageName } from "../config.js";
import type { DiscoveryResult, JsonObject } from "../domain/types.js";

interface RegistryMetadata extends JsonObject {
  "dist-tags": JsonObject;
  time: JsonObject;
}

export async function discoverReleases(
  afterVersion?: string,
  fetcher: typeof fetch = fetch,
): Promise<DiscoveryResult> {
  const response = await fetcher(
    `https://registry.npmjs.org/${releasePackageName}`,
  );
  if (!response.ok)
    throw new Error(
      `npm registry returned ${response.status} ${response.statusText}`,
    );
  const metadata = (await response.json()) as RegistryMetadata;
  const latestVersion = metadata["dist-tags"].latest;
  if (typeof latestVersion !== "string")
    throw new Error("npm registry metadata does not contain dist-tags.latest");
  const ordered = Object.entries(metadata.time)
    .filter(
      ([version, timestamp]) =>
        /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version) &&
        typeof timestamp === "string",
    )
    .sort((left, right) => String(left[1]).localeCompare(String(right[1])));
  const afterIndex = afterVersion
    ? ordered.findIndex(([version]) => version === afterVersion)
    : -1;
  if (afterVersion && afterIndex < 0)
    throw new Error(
      `Baseline version ${afterVersion} is absent from npm release history`,
    );
  const selected = afterVersion ? ordered.slice(afterIndex + 1) : ordered;
  const publishedVersions = selected.map(([version]) => version);
  const analysisVersion = publishedVersions.includes(latestVersion)
    ? latestVersion
    : undefined;
  return {
    packageName: releasePackageName,
    latestVersion,
    publishedVersions,
    ...(analysisVersion ? { analysisVersion } : {}),
    supersededVersions: publishedVersions.filter(
      (version) => version !== latestVersion,
    ),
    checkedAt: new Date().toISOString(),
  };
}
