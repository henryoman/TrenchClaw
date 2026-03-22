import type {
  RuntimeApiAiSettingsResponse,
  RuntimeApiUpdateAiSettingsRequest,
  RuntimeApiUpdateAiSettingsResponse,
  RuntimeApiActivityResponse,
  RuntimeApiBootstrapResponse,
  RuntimeApiSolPriceResponse,
  RuntimeApiTradingSettingsResponse,
  RuntimeApiUpdateTradingSettingsRequest,
  RuntimeApiUpdateTradingSettingsResponse,
  RuntimeApiWakeupSettingsResponse,
  RuntimeApiUpdateWakeupSettingsRequest,
  RuntimeApiUpdateWakeupSettingsResponse,
  RuntimeApiScheduleResponse,
  RuntimeApiConversationMessagesResponse,
  RuntimeApiConversationsResponse,
  RuntimeApiCreateInstanceRequest,
  RuntimeApiCreateInstanceResponse,
  RuntimeApiDeleteConversationResponse,
  RuntimeApiDeleteSecretRequest,
  RuntimeApiDeleteSecretResponse,
  RuntimeApiInstancesResponse,
  RuntimeApiLlmCheckResponse,
  RuntimeApiQueueResponse,
  RuntimeApiSecretsResponse,
  RuntimeApiSignInInstanceRequest,
  RuntimeApiSignInInstanceResponse,
  RuntimeApiWalletsResponse,
  RuntimeApiUpsertSecretRequest,
  RuntimeApiUpsertSecretResponse,
} from "@trenchclaw/types";
import { APP_API_BASE_PATH, REQUEST_TIMEOUT_MS } from "./config";

export const runtimeBaseUrl = (import.meta.env.VITE_TRENCHCLAW_RUNTIME_URL ?? "").trim().replace(/\/+$/u, "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const toRuntimeUrl = (pathname: string): string => `${runtimeBaseUrl}${pathname}`;

const fetchJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Runtime request timed out after ${REQUEST_TIMEOUT_MS}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorText =
      isRecord(payload) && typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new Error(errorText);
  }

  return payload as T;
};

export const runtimeApi = {
  bootstrap: (): Promise<RuntimeApiBootstrapResponse> => fetchJson<RuntimeApiBootstrapResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/bootstrap`)),
  solPrice: (): Promise<RuntimeApiSolPriceResponse> => fetchJson<RuntimeApiSolPriceResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/sol-price`)),
  queue: (): Promise<RuntimeApiQueueResponse> => fetchJson<RuntimeApiQueueResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/queue`)),
  schedule: (): Promise<RuntimeApiScheduleResponse> => fetchJson<RuntimeApiScheduleResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/schedule`)),
  activity: (limit = 100): Promise<RuntimeApiActivityResponse> =>
    fetchJson<RuntimeApiActivityResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/activity?limit=${Math.max(1, Math.trunc(limit))}`)),
  conversations: (limit = 100): Promise<RuntimeApiConversationsResponse> =>
    fetchJson<RuntimeApiConversationsResponse>(
      toRuntimeUrl(`${APP_API_BASE_PATH}/conversations?limit=${Math.max(1, Math.trunc(limit))}`),
    ),
  conversationMessages: (conversationId: string, limit = 500): Promise<RuntimeApiConversationMessagesResponse> =>
    fetchJson<RuntimeApiConversationMessagesResponse>(
      toRuntimeUrl(
        `${APP_API_BASE_PATH}/conversations/${encodeURIComponent(conversationId)}/messages?limit=${Math.max(1, Math.trunc(limit))}`,
      ),
    ),
  deleteConversation: (conversationId: string): Promise<RuntimeApiDeleteConversationResponse> =>
    fetchJson<RuntimeApiDeleteConversationResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/conversations/${encodeURIComponent(conversationId)}`), {
      method: "DELETE",
    }),
  instances: (): Promise<RuntimeApiInstancesResponse> => fetchJson<RuntimeApiInstancesResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/instances`)),
  createInstance: (input: RuntimeApiCreateInstanceRequest): Promise<RuntimeApiCreateInstanceResponse> =>
    fetchJson<RuntimeApiCreateInstanceResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/instances`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  signInInstance: (input: RuntimeApiSignInInstanceRequest): Promise<RuntimeApiSignInInstanceResponse> =>
    fetchJson<RuntimeApiSignInInstanceResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/instances/sign-in`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  aiSettings: (): Promise<RuntimeApiAiSettingsResponse> => fetchJson<RuntimeApiAiSettingsResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/ai-settings`)),
  updateAiSettings: (input: RuntimeApiUpdateAiSettingsRequest): Promise<RuntimeApiUpdateAiSettingsResponse> =>
    fetchJson<RuntimeApiUpdateAiSettingsResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/ai-settings`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  tradingSettings: (): Promise<RuntimeApiTradingSettingsResponse> =>
    fetchJson<RuntimeApiTradingSettingsResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/trading-settings`)),
  updateTradingSettings: (input: RuntimeApiUpdateTradingSettingsRequest): Promise<RuntimeApiUpdateTradingSettingsResponse> =>
    fetchJson<RuntimeApiUpdateTradingSettingsResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/trading-settings`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  wakeupSettings: (): Promise<RuntimeApiWakeupSettingsResponse> =>
    fetchJson<RuntimeApiWakeupSettingsResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/wakeup-settings`)),
  updateWakeupSettings: (input: RuntimeApiUpdateWakeupSettingsRequest): Promise<RuntimeApiUpdateWakeupSettingsResponse> =>
    fetchJson<RuntimeApiUpdateWakeupSettingsResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/wakeup-settings`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  secrets: (): Promise<RuntimeApiSecretsResponse> => fetchJson<RuntimeApiSecretsResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/secrets`)),
  upsertSecret: (input: RuntimeApiUpsertSecretRequest): Promise<RuntimeApiUpsertSecretResponse> =>
    fetchJson<RuntimeApiUpsertSecretResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/secrets`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  deleteSecret: (input: RuntimeApiDeleteSecretRequest): Promise<RuntimeApiDeleteSecretResponse> =>
    fetchJson<RuntimeApiDeleteSecretResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/secrets`), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  llmCheck: (): Promise<RuntimeApiLlmCheckResponse> => fetchJson<RuntimeApiLlmCheckResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/llm/check`)),
  wallets: (): Promise<RuntimeApiWalletsResponse> => fetchJson<RuntimeApiWalletsResponse>(toRuntimeUrl(`${APP_API_BASE_PATH}/wallets`)),
  walletBackupDownloadUrl: (relativePath: string): string =>
    toRuntimeUrl(`${APP_API_BASE_PATH}/wallets/download?path=${encodeURIComponent(relativePath)}`),
  reportClientError: (input: {
    source: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ ok: true }> =>
    fetchJson<{ ok: true }>(toRuntimeUrl(`${APP_API_BASE_PATH}/client-error`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};
