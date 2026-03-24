import { deepMerge, isRecord } from "../shared/object-utils";

const USER_PROTECTED_PATH_PREFIXES = [
  "wallet.dangerously",
  "trading.enabled",
  "trading.limits",
  "trading.preferences",
  "trading.jupiter.trigger.allowOrders",
  "trading.jupiter.trigger.allowCancellations",
  "trading.jupiter.ultra.allowExecutions",
  "trading.jupiter.standard.allowExecutions",
  "agent.dangerously",
  "agent.internetAccess",
  "network.cluster",
  "network.commitment",
  "network.rpc",
] as const;

type SettingsAuthorityProfile = "safe" | "dangerous" | "veryDangerous";

const AGENT_EDITABLE_PATH_PREFIXES_DANGEROUS = [
  // Keep dangerous mode focused on bot capabilities only.
  "agent.enabled",
] as const;

const pathToSegments = (path: string): string[] => path.split(".").filter(Boolean);

const getPath = (value: unknown, path: string): unknown => {
  const segments = pathToSegments(path);
  let current: unknown = value;

  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
};

const hasPath = (value: unknown, path: string): boolean => {
  const segments = pathToSegments(path);
  let current: unknown = value;

  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return false;
    }
    current = current[segment];
  }

  return true;
};

const setPath = (root: Record<string, unknown>, path: string, nextValue: unknown): void => {
  const segments = pathToSegments(path);
  if (!segments.length) {
    return;
  }

  let current: Record<string, unknown> = root;
  for (const segment of segments.slice(0, -1)) {
    const nested = current[segment];
    if (!isRecord(nested)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = segments[segments.length - 1];
  if (!lastSegment) {
    return;
  }
  current[lastSegment] = nextValue;
};

const deletePath = (root: Record<string, unknown>, path: string): void => {
  const segments = pathToSegments(path);
  if (!segments.length) {
    return;
  }

  let current: Record<string, unknown> = root;
  for (const segment of segments.slice(0, -1)) {
    const nested = current[segment];
    if (!isRecord(nested)) {
      return;
    }
    current = nested;
  }

  const lastSegment = segments[segments.length - 1];
  if (!lastSegment) {
    return;
  }
  delete current[lastSegment];
};

const isPathAllowedByPrefixes = (path: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));

const collectLeafPaths = (value: unknown, prefix = ""): string[] => {
  if (!isRecord(value)) {
    return prefix ? [prefix] : [];
  }

  const leafPaths: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (isRecord(nested)) {
      leafPaths.push(...collectLeafPaths(nested, nextPrefix));
      continue;
    }
    leafPaths.push(nextPrefix);
  }

  return leafPaths;
};

const getAgentEditablePathPrefixes = (
  profile: SettingsAuthorityProfile,
): readonly string[] => {
  if (profile === "safe") {
    return [];
  }
  if (profile === "veryDangerous") {
    return [];
  }
  return AGENT_EDITABLE_PATH_PREFIXES_DANGEROUS;
};

export const sanitizeAgentSettings = (
  agentSettings: unknown,
  profile: SettingsAuthorityProfile = "dangerous",
): Record<string, unknown> => {
  if (!isRecord(agentSettings)) {
    return {};
  }

  if (profile === "safe") {
    return {};
  }

  if (profile === "veryDangerous") {
    return deepMerge({}, agentSettings) as Record<string, unknown>;
  }

  const filtered: Record<string, unknown> = {};
  const leafPaths = collectLeafPaths(agentSettings);
  const allowedPrefixes = getAgentEditablePathPrefixes(profile);

  for (const path of leafPaths) {
    if (!isPathAllowedByPrefixes(path, allowedPrefixes)) {
      continue;
    }
    const value = getPath(agentSettings, path);
    if (value !== undefined) {
      setPath(filtered, path, value);
    }
  }

  return filtered;
};

export interface EnforceUserProtectedSettingsInput {
  baseSettings: unknown;
  userSettings: unknown;
  mergedSettings: unknown;
}

export const enforceUserProtectedSettings = (
  input: EnforceUserProtectedSettingsInput,
): Record<string, unknown> => {
  const merged = isRecord(input.mergedSettings)
    ? { ...input.mergedSettings }
    : {};

  for (const path of USER_PROTECTED_PATH_PREFIXES) {
    const userValue = getPath(input.userSettings, path);
    const baseValue = getPath(input.baseSettings, path);

    if (hasPath(input.userSettings, path)) {
      if (isRecord(baseValue) && isRecord(userValue)) {
        setPath(merged, path, deepMerge(baseValue, userValue));
      } else {
        setPath(merged, path, userValue);
      }
      continue;
    }

    if (hasPath(input.baseSettings, path)) {
      setPath(merged, path, getPath(input.baseSettings, path));
      continue;
    }

    deletePath(merged, path);
  }

  return merged;
};
