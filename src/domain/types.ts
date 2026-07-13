export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export interface ArtifactDescriptor extends JsonObject {
  artifactKind: string;
  sha256: string;
}

export interface SourceDescriptor extends JsonObject {
  id: string;
  requestedUrl?: string;
  resolvedUrl?: string;
  sha256?: string;
  role?: string;
}

export interface SurfaceManifest extends JsonObject {
  schemaVersion: number;
  artifactKind: string;
  claudeCodeVersion: string;
  generatorVersion?: string;
  sourcePolicy: string;
  sources: SourceDescriptor[];
  artifacts: Record<string, ArtifactDescriptor>;
  counts: JsonObject;
  drift: JsonObject;
  safety: JsonObject;
  release: JsonObject;
}

export interface GenerationOptions {
  version: string;
  outputDirectory: string;
  baseUrl: string;
  platformPackage?: string;
  sourceDirectory?: string;
}

export interface GenerationResult {
  version: string;
  outputDirectory: string;
  manifest: SurfaceManifest;
  validation: ValidationReport;
}

export interface ValidationCheck extends JsonObject {
  name: string;
  status: "passed" | "failed";
  detail?: string;
}

export interface ValidationReport extends JsonObject {
  schemaVersion: number;
  artifactKind: string;
  claudeCodeVersion: string;
  status: "passed" | "failed";
  checks: ValidationCheck[];
  counts: JsonObject;
}

export interface DiscoveryResult extends JsonObject {
  packageName: string;
  latestVersion: string;
  publishedVersions: string[];
  checkedAt: string;
}
