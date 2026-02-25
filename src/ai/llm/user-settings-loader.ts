import path from "node:path";
import { isRecord, parseStructuredFile, resolvePathFromModule } from "./shared";

const DEFAULT_USER_SETTINGS_FILE = "../brain/user-settings/settings.yaml";
const DEFAULT_VAULT_FILE = "../brain/protected/system/no-read/vault.json";

const USER_SETTINGS_FILE_ENV = "TRENCHCLAW_USER_SETTINGS_FILE";
const VAULT_FILE_ENV = "TRENCHCLAW_VAULT_FILE";

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
  vaultPath: string;
  rawSettings: unknown;
  resolvedSettings: unknown;
  warnings: string[];
}

export const loadResolvedUserSettings = async (): Promise<ResolvedUserSettingsPayload> => {
  const userSettingsPath = resolvePathFromModule(
    import.meta.url,
    DEFAULT_USER_SETTINGS_FILE,
    process.env[USER_SETTINGS_FILE_ENV],
  );
  const vaultPath = resolvePathFromModule(import.meta.url, DEFAULT_VAULT_FILE, process.env[VAULT_FILE_ENV]);

  const rawSettings = await parseStructuredFile(userSettingsPath);
  const vaultData = await parseStructuredFile(vaultPath);
  const context: ResolveContext = {
    vaultData,
    warnings: [],
    fileCache: new Map<string, unknown>(),
  };

  const resolvedSettings = await resolveValue(rawSettings, path.dirname(userSettingsPath), context);

  return {
    userSettingsPath,
    vaultPath,
    rawSettings,
    resolvedSettings,
    warnings: context.warnings,
  };
};

export const renderResolvedUserSettingsSection = async (): Promise<string> => {
  try {
    const payload = await loadResolvedUserSettings();
    const warningLines =
      payload.warnings.length > 0
        ? `\nWarnings:\n${payload.warnings.map((warning) => `- ${warning}`).join("\n")}\n`
        : "";

    return `## User Settings (Resolved)
Source:
- settings: ${payload.userSettingsPath}
- vault: ${payload.vaultPath}
${warningLines}\`\`\`json
${JSON.stringify(payload.resolvedSettings, null, 2)}
\`\`\``;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `## User Settings (Resolved)
User settings could not be loaded: ${message}`;
  }
};
