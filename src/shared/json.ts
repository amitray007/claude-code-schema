import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { JsonValue } from "../domain/types.js";

export function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function jsonSha256(value: unknown): string {
  return sha256(jsonText(value));
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, jsonText(value));
}

export function cloneJson<T extends JsonValue | object>(value: T): T {
  return structuredClone(value);
}

export async function replaceDirectory(
  staging: string,
  destination: string,
): Promise<void> {
  const backup = resolve(
    dirname(destination),
    `.${destination.split("/").at(-1)}.backup-${process.pid}`,
  );
  await rm(backup, { recursive: true, force: true });
  let movedExisting = false;
  try {
    await rename(destination, backup);
    movedExisting = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await rename(staging, destination);
    if (movedExisting) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedExisting) await rename(backup, destination);
    throw error;
  }
}
