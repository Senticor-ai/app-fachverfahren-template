import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type JsonObject = Record<string, unknown>;

export interface PackageJson extends JsonObject {
  name?: string;
  version?: string;
  packageManager?: string;
  engines?: unknown;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function readJson<T = JsonObject>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path: string, value: unknown) {
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeFileAtomic(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, path);
}

export async function editPackageJson(
  path: string,
  edit: (packageJson: JsonObject) => void,
) {
  const json = await readJson(path);
  edit(json);
  await writeJson(path, json);
}

export function setPackageScript(
  packageJson: JsonObject,
  name: string,
  value: string,
) {
  const scripts =
    typeof packageJson["scripts"] === "object" &&
    packageJson["scripts"] !== null
      ? (packageJson["scripts"] as Record<string, string>)
      : {};
  scripts[name] = value;
  packageJson["scripts"] = scripts;
}

export function replaceExactlyOnce(
  text: string,
  from: string,
  to: string,
  label = from,
) {
  const occurrences = text.split(from).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `expected exactly one occurrence of ${label}, found ${occurrences}`,
    );
  }
  return text.replace(from, to);
}

export function assertNoTemplatePlaceholders(text: string, path: string) {
  const placeholders = [
    "replace-with-domain-id",
    "Replace With Domain",
    "__DOMAIN__",
    "__DISPLAY_NAME__",
  ].filter((placeholder) => text.includes(placeholder));

  if (placeholders.length > 0) {
    throw new Error(
      `${path} still contains template placeholders: ${placeholders.join(", ")}`,
    );
  }
}
