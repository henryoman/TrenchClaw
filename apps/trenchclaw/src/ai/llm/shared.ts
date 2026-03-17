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

export const resolvePreferredPath = async (input: {
  preferredPath: string;
  envValues?: Array<string | undefined>;
  legacyPaths?: string[];
}): Promise<string> => {
  const configuredPath = input.envValues
    ?.map((value) => value?.trim())
    .find((value): value is string => typeof value === "string" && value.length > 0);
  if (configuredPath) {
    return configuredPath;
  }

  const preferredPath = path.resolve(input.preferredPath);
  if (await Bun.file(preferredPath).exists()) {
    return preferredPath;
  }

  const legacyPaths = await Promise.all(
    (input.legacyPaths ?? []).map(async (legacyPath) => {
      const resolvedLegacyPath = path.resolve(legacyPath);
      return {
        legacyPath: resolvedLegacyPath,
        exists: await Bun.file(resolvedLegacyPath).exists(),
      };
    }),
  );
  const matchingLegacyPath = legacyPaths.find((candidate) => candidate.exists)?.legacyPath;
  if (matchingLegacyPath) {
    return matchingLegacyPath;
  }

  return preferredPath;
};

export const resolvePreferredPathFromModule = async (input: {
  moduleUrl: string;
  preferredRelativePath: string;
  envValues?: Array<string | undefined>;
  legacyRelativePaths?: string[];
}): Promise<string> => {
  return resolvePreferredPath({
    preferredPath: fileURLToPath(new URL(input.preferredRelativePath, input.moduleUrl)),
    envValues: input.envValues,
    legacyPaths: (input.legacyRelativePaths ?? []).map((legacyRelativePath) =>
      fileURLToPath(new URL(legacyRelativePath, input.moduleUrl))),
  });
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
