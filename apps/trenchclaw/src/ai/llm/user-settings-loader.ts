import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveRequiredActiveInstanceIdSync } from "../../runtime/instance/state";
import { resolveInstanceCompatibilitySettingsPath } from "../../runtime/instance/paths";
import { resolveRuntimeSeedInstancePath } from "../../runtime/runtime-paths";
import { assertInstanceSystemWritePath } from "../../runtime/security/write-scope";
import { isRecord, parseStructuredFile } from "./shared";
import { loadVaultData } from "./vault-file";
import { loadInstanceTradingSettings } from "../../runtime/settings/instance/trading";

const RUNTIME_SETTINGS_FILE_ENV = "TRENCHCLAW_RUNTIME_SETTINGS_FILE";

const resolveCompatibilitySettingsFilePath = (): string => {
  const configuredPath = process.env[RUNTIME_SETTINGS_FILE_ENV]?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  return resolveInstanceCompatibilitySettingsPath(
    resolveRequiredActiveInstanceIdSync(
      "No active instance selected. Compatibility settings are instance-scoped. Sign in before accessing runtime settings.",
    ),
  );
};

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

const getByPath = (root: unknown, segments: string[]): unknown => {
  let current = root;
  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

const readVaultStringByPath = (vaultData: unknown, refPath: string): string | undefined => {
  const value = getByPath(vaultData, refPath.split("/").map((segment) => segment.trim()).filter(Boolean));
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

const isUnresolvedVaultRef = (value: unknown): value is string =>
  typeof value === "string" && value.trim().startsWith("vault://");

const isLikelyRelativeConfigRef = (value: string): boolean => {
  if (!value || value.startsWith("vault://")) {
    return false;
  }
  if (/^[a-z]+:\/\//i.test(value)) {
    return false;
  }
  return /\.(yaml|yml|json)$/i.test(value.trim());
};

interface ResolveContext {
  vaultData: unknown;
  warnings: string[];
  fileCache: Map<string, unknown>;
}

const resolveValue = async (
  value: unknown,
  currentDir: string,
  context: ResolveContext,
): Promise<unknown> => {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.startsWith("vault://")) {
      const pathSegments = trimmed
        .slice("vault://".length)
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (pathSegments.length === 0) {
        context.warnings.push(`Invalid vault reference "${trimmed}"`);
        return value;
      }

      const resolved = getByPath(context.vaultData, pathSegments);
      if (resolved === undefined) {
        context.warnings.push(`Missing vault path "${trimmed}"`);
        return value;
      }

      return resolveValue(resolved, currentDir, context);
    }

    if (isLikelyRelativeConfigRef(trimmed)) {
      const targetPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(currentDir, trimmed);
      const normalized = path.normalize(targetPath);

      if (context.fileCache.has(normalized)) {
        return context.fileCache.get(normalized);
      }

      try {
        const parsed = await parseStructuredFile(normalized);
        const resolved = await resolveValue(parsed, path.dirname(normalized), context);
        context.fileCache.set(normalized, resolved);
        return resolved;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.warnings.push(`Failed to resolve file reference "${trimmed}": ${message}`);
        return value;
      }
    }

    return value;
  }

  if (Array.isArray(value)) {
    const resolvedItems = await Promise.all(
      value.map((entry) => resolveValue(entry, currentDir, context)),
    );
    return resolvedItems;
  }

  if (isRecord(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, nestedValue]) => [
        key,
        await resolveValue(nestedValue, currentDir, context),
      ]),
    );
    return Object.fromEntries(entries);
  }

  return value;
};

export interface ResolvedUserSettingsPayload {
  vaultPath: string | null;
  rawSettings: unknown;
  resolvedSettings: unknown;
  warnings: string[];
  compatibilitySettingsPath: string;
  instanceTradingSettingsPath: string | null;
  activeInstanceId: string | null;
}

export const ensureCompatibilitySettingsFileExists = async (
  filePath: string,
): Promise<void> => {
  const targetPath = path.resolve(filePath);
  const file = Bun.file(targetPath);
  if (await file.exists()) {
    return;
  }

  if (!process.env[RUNTIME_SETTINGS_FILE_ENV]?.trim()) {
    assertInstanceSystemWritePath(targetPath, "initialize compatibility settings file");
  }

  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const seedPath = resolveRuntimeSeedInstancePath("settings", "settings.json");
  const content = await readFile(seedPath, "utf8").catch((error) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Runtime seed is missing compatibility settings file: "${seedPath}"`);
    }
    throw error;
  });
  await writeFile(targetPath, content, { encoding: "utf8", mode: 0o600 });
};

const loadOptionalStructuredSettingsLayer = async (filePath: string | null): Promise<unknown> => {
  if (!filePath) {
    return {};
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return {};
  }

  return parseStructuredFile(filePath);
};

export const loadResolvedUserSettings = async (): Promise<ResolvedUserSettingsPayload> => {
  const compatibilitySettingsPath = path.resolve(resolveCompatibilitySettingsFilePath());
  const vaultPayload = await loadVaultData();
  const warnings: string[] = [];
  const fileCache = new Map<string, unknown>();

  const rawPreferredCompatibilitySettings = await loadOptionalStructuredSettingsLayer(compatibilitySettingsPath);
  const rawCompatibilitySettings = rawPreferredCompatibilitySettings;

  const preferredContext: ResolveContext = {
    vaultData: vaultPayload.vaultData,
    warnings,
    fileCache,
  };
  const resolvedPreferredCompatibilitySettings = await resolveValue(
    rawPreferredCompatibilitySettings,
    path.dirname(compatibilitySettingsPath),
    preferredContext,
  );
  const instanceTradingSettings = await loadInstanceTradingSettings();
  const rawSettings = {
    compatibility: rawCompatibilitySettings,
    instanceTrading: instanceTradingSettings.rawSettings,
  };
  const resolvedSettings = deepMerge(
    resolvedPreferredCompatibilitySettings,
    instanceTradingSettings.resolvedSettings,
  );

  return {
    vaultPath: vaultPayload.vaultPath,
    rawSettings,
    resolvedSettings,
    warnings,
    compatibilitySettingsPath,
    instanceTradingSettingsPath: instanceTradingSettings.settingsPath,
    activeInstanceId: instanceTradingSettings.instanceId,
  };
};

export const renderResolvedUserSettingsSection = async (): Promise<string> => {
  try {
    const payload = await loadResolvedUserSettings();
    const warningLines =
      payload.warnings.length > 0
        ? `\nWarnings:\n${payload.warnings.map((warning) => `- ${warning}`).join("\n")}\n`
        : "";

    return `## Runtime Settings (Resolved)
Source:
- compatibility settings: ${payload.compatibilitySettingsPath}
- instance trading settings: ${payload.instanceTradingSettingsPath ?? "none"}
- active instance: ${payload.activeInstanceId ?? "none"}
- vault: ${payload.vaultPath ?? "none"}
${warningLines}\`\`\`json
${JSON.stringify(payload.resolvedSettings, null, 2)}
\`\`\``;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `## Runtime Settings (Resolved)
Runtime settings could not be loaded: ${message}`;
  }
};
