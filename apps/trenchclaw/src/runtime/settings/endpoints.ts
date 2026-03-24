import type { RuntimeSettings } from "./runtime-schema";

export interface ResolvedRuntimeEndpoints {
  endpointName: string;
  rpcUrl: string;
  wsUrl: string;
}

const validateUrl = (
  input: string,
  configPath: string,
  allowedProtocols: readonly string[],
): string => {
  const normalized = input.trim();
  if (!normalized) {
    throw new Error(`Runtime endpoint "${configPath}" is empty.`);
  }

  if (normalized.startsWith("vault://")) {
    throw new Error(
      `Runtime endpoint "${configPath}" must be resolved to a concrete URL before bootstrap. Received unresolved ref "${normalized}".`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Runtime endpoint "${configPath}" is invalid: ${message}`, { cause: error });
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(
      `Runtime endpoint "${configPath}" must use one of ${allowedProtocols.join(", ")}. Received "${parsed.protocol}".`,
    );
  }

  return parsed.toString();
};

export const resolvePrimaryRuntimeEndpoints = (settings: RuntimeSettings): ResolvedRuntimeEndpoints => {
  const preferredEndpoint = settings.network.rpc.endpoints.find((endpoint) => endpoint.enabled);
  const endpoint = preferredEndpoint ?? settings.network.rpc.endpoints[0];
  if (!endpoint) {
    throw new Error("Runtime settings must define at least one RPC endpoint.");
  }

  return {
    endpointName: endpoint.name,
    rpcUrl: validateUrl(endpoint.url, `network.rpc.endpoints.${endpoint.name}.url`, ["http:", "https:"]),
    wsUrl: validateUrl(endpoint.wsUrl, `network.rpc.endpoints.${endpoint.name}.wsUrl`, ["ws:", "wss:"]),
  };
};

export const assertResolvedRuntimeEndpoints = (settings: RuntimeSettings): RuntimeSettings => {
  resolvePrimaryRuntimeEndpoints(settings);
  return settings;
};
