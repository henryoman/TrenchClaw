import path from "node:path";
import { fileURLToPath } from "node:url";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

export const resolvePathFromModule = (
  moduleUrl: string,
  relativePath: string,
  envValue?: string,
): string => {
  const configuredPath = envValue?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  return fileURLToPath(new URL(relativePath, moduleUrl));
};

export const parseStructuredFile = async (filePath: string): Promise<unknown> => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`File does not exist: "${filePath}"`);
  }

  const text = await file.text();
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json") {
    return JSON.parse(text);
  }

  if (extension === ".yaml" || extension === ".yml") {
    return Bun.YAML.parse(text);
  }

  return text;
};
