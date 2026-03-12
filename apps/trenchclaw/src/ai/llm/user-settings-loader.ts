import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isRecord, parseStructuredFile, resolvePreferredPathFromModule } from "./shared";
import { loadVaultLayers } from "./vault-file";
import { loadInstanceTradingSettings } from "../../runtime/load/trading-settings";

const DEFAULT_COMPATIBILITY_SETTINGS_FILE = "../../../.runtime-state/runtime/settings.json";
const LEGACY_COMPATIBILITY_SETTINGS_FILE = "../../../.runtime-state/user/settings.json";

const RUNTIME_SETTINGS_FILE_ENV = "TRENCHCLAW_RUNTIME_SETTINGS_FILE";
const LEGACY_USER_SETTINGS_FILE_ENV = "TRENCHCLAW_USER_SETTINGS_FILE";

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
  userSettingsPath: string;
  runtimeVaultPath: string;
  instanceVaultPath: string | null;
  rawSettings: unknown;
  resolvedSettings: unknown;
  warnings: string[];
  compatibilitySettingsPath: string;
  instanceTradingSettingsPath: string | null;
  activeInstanceId: string | null;
}

const ensureStructuredSettingsFileExists = async (filePath: string): Promise<void> => {
  const targetPath = path.resolve(filePath);
  const file = Bun.file(targetPath);
  if (await file.exists()) {
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  await writeFile(targetPath, "{}\n", { encoding: "utf8", mode: 0o600 });
};

export const loadResolvedUserSettings = async (): Promise<ResolvedUserSettingsPayload> => {
  const compatibilitySettingsPath = await resolvePreferredPathFromModule({
    moduleUrl: import.meta.url,
    preferredRelativePath: DEFAULT_COMPATIBILITY_SETTINGS_FILE,
    envValues: [process.env[RUNTIME_SETTINGS_FILE_ENV], process.env[LEGACY_USER_SETTINGS_FILE_ENV]],
    legacyRelativePaths: [LEGACY_COMPATIBILITY_SETTINGS_FILE],
  });

  await ensureStructuredSettingsFileExists(compatibilitySettingsPath);
  const vaultLayers = await loadVaultLayers();

  const rawCompatibilitySettings = await parseStructuredFile(compatibilitySettingsPath);
  const context: ResolveContext = {
    vaultData: vaultLayers.mergedVaultData,
    warnings: [],
    fileCache: new Map<string, unknown>(),
  };

  const resolvedCompatibilitySettings = await resolveValue(
    rawCompatibilitySettings,
    path.dirname(compatibilitySettingsPath),
    context,
  );
  const instanceTradingSettings = await loadInstanceTradingSettings();
  const rawSettings = {
    compatibility: rawCompatibilitySettings,
    instanceTrading: instanceTradingSettings.rawSettings,
  };
  const resolvedSettings = deepMerge(
    resolvedCompatibilitySettings,
    instanceTradingSettings.resolvedSettings,
  );

  return {
    userSettingsPath: compatibilitySettingsPath,
    runtimeVaultPath: vaultLayers.runtimeVaultPath,
    instanceVaultPath: vaultLayers.instanceVaultPath,
    rawSettings,
    resolvedSettings,
    warnings: context.warnings,
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
- runtime vault: ${payload.runtimeVaultPath}
- instance vault: ${payload.instanceVaultPath ?? "none"}
${warningLines}\`\`\`json
${JSON.stringify(payload.resolvedSettings, null, 2)}
\`\`\``;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `## Runtime Settings (Resolved)
Runtime settings could not be loaded: ${message}`;
  }
};
