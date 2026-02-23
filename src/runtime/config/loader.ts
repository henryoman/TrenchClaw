import { fileURLToPath } from "node:url";

import { runtimeSettingsSchema, type RuntimeSettings } from "./schema";

export type RuntimeSettingsProfile = "default" | "safe";

const SETTINGS_FILE_BY_PROFILE: Record<RuntimeSettingsProfile, string> = {
  default: "../../settings/default.yaml",
  safe: "../../settings/safe.yaml",
};

const ENV_TOKEN_REGEX = /\$\{([A-Z0-9_]+)\}/g;

const resolveEnvTokens = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(ENV_TOKEN_REGEX, (_token, variableName: string) => process.env[variableName] ?? "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvTokens(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return Object.fromEntries(entries.map(([key, nestedValue]) => [key, resolveEnvTokens(nestedValue)]));
  }

  return value;
};

const parseYaml = (source: string, filePath: string): unknown => {
  try {
    const parsed = Bun.YAML.parse(source);
    if (parsed == null || typeof parsed !== "object") {
      throw new Error("Settings file must parse to an object");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse settings YAML at "${filePath}": ${message}`);
  }
};

export const getSettingsFilePath = (profile: RuntimeSettingsProfile): string => {
  const relativePath = SETTINGS_FILE_BY_PROFILE[profile];
  return fileURLToPath(new URL(relativePath, import.meta.url));
};

export const loadRuntimeSettings = async (
  profile: RuntimeSettingsProfile = "default",
): Promise<RuntimeSettings> => {
  const filePath = getSettingsFilePath(profile);
  const rawYaml = await Bun.file(filePath).text();
  const parsedYaml = parseYaml(rawYaml, filePath);
  const withResolvedEnv = resolveEnvTokens(parsedYaml);
  const validated = runtimeSettingsSchema.parse(withResolvedEnv);

  if (validated.profile !== profile) {
    throw new Error(
      `Settings profile mismatch in "${filePath}". Expected "${profile}" but got "${validated.profile}"`,
    );
  }

  return validated;
};
