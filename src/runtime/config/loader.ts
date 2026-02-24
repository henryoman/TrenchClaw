import { fileURLToPath } from "node:url";

import { enforceUserProtectedSettings, sanitizeAgentSettings } from "./authority";
import { runtimeSettingsSchema, type RuntimeSettings } from "./schema";

export type RuntimeSettingsProfile = "default" | "safe";

const SETTINGS_FILE_BY_PROFILE: Record<RuntimeSettingsProfile, string> = {
  default: "../../settings/default.yaml",
  safe: "../../settings/safe.yaml",
};

const ENV_TOKEN_REGEX = /\$\{([A-Z0-9_]+)\}/g;
const SETTINGS_PROFILE_ENV_KEY = "TRENCHCLAW_PROFILE";
const SETTINGS_BASE_FILE_ENV_KEY = "TRENCHCLAW_SETTINGS_BASE_FILE";
const SETTINGS_USER_FILE_ENV_KEY = "TRENCHCLAW_SETTINGS_USER_FILE";
const SETTINGS_AGENT_FILE_ENV_KEY = "TRENCHCLAW_SETTINGS_AGENT_FILE";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const deepMerge = (baseValue: unknown, overlayValue: unknown): unknown => {
  if (!isRecord(baseValue) || !isRecord(overlayValue)) {
    return overlayValue;
  }

  const merged: Record<string, unknown> = { ...baseValue };

  for (const [key, value] of Object.entries(overlayValue)) {
    const currentValue = merged[key];
    merged[key] =
      isRecord(currentValue) && isRecord(value) ? deepMerge(currentValue, value) : value;
  }

  return merged;
};

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
    throw new Error(`Failed to parse settings YAML at "${filePath}": ${message}`, {
      cause: error,
    });
  }
};

const readSettingsFile = async (filePath: string): Promise<unknown> => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Settings file does not exist: "${filePath}"`);
  }

  return parseYaml(await file.text(), filePath);
};

const loadOptionalSettingsFile = async (filePath: string | undefined): Promise<unknown> => {
  if (!filePath) {
    return {};
  }

  return readSettingsFile(filePath);
};

export const resolveRuntimeSettingsProfile = (
  profileFromEnv = process.env[SETTINGS_PROFILE_ENV_KEY],
): RuntimeSettingsProfile => {
  if (!profileFromEnv) {
    return "default";
  }

  if (profileFromEnv === "default" || profileFromEnv === "safe") {
    return profileFromEnv;
  }

  throw new Error(
    `Invalid ${SETTINGS_PROFILE_ENV_KEY} value "${profileFromEnv}". Expected "default" or "safe".`,
  );
};

export const getSettingsFilePath = (profile: RuntimeSettingsProfile): string => {
  const relativePath = SETTINGS_FILE_BY_PROFILE[profile];
  return fileURLToPath(new URL(relativePath, import.meta.url));
};

export const loadRuntimeSettings = async (
  profile: RuntimeSettingsProfile = resolveRuntimeSettingsProfile(),
): Promise<RuntimeSettings> => {
  const baseSettingsPath = process.env[SETTINGS_BASE_FILE_ENV_KEY] || getSettingsFilePath(profile);
  const userSettingsPath = process.env[SETTINGS_USER_FILE_ENV_KEY];
  const agentSettingsPath = process.env[SETTINGS_AGENT_FILE_ENV_KEY];

  const baseSettings = await readSettingsFile(baseSettingsPath);
  const userSettings = await loadOptionalSettingsFile(userSettingsPath);
  const agentSettings = await loadOptionalSettingsFile(agentSettingsPath);
  const sanitizedAgentSettings = sanitizeAgentSettings(agentSettings);
  const mergedSettings = deepMerge(deepMerge(baseSettings, sanitizedAgentSettings), userSettings);
  const protectedMergedSettings = enforceUserProtectedSettings({
    baseSettings,
    userSettings,
    mergedSettings,
  });
  const withResolvedEnv = resolveEnvTokens(protectedMergedSettings);
  const validated = runtimeSettingsSchema.parse(withResolvedEnv);
  const usingBundledBaseProfile = !process.env[SETTINGS_BASE_FILE_ENV_KEY];

  if (usingBundledBaseProfile && validated.profile !== profile) {
    throw new Error(
      `Settings profile mismatch after applying overrides. Expected "${profile}" but got "${validated.profile}"`,
    );
  }

  return validated;
};
