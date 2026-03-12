import type {
  GuiAiSettingsResponse,
  GuiUpdateAiSettingsRequest,
  GuiUpdateAiSettingsResponse,
  GuiActivityResponse,
  GuiBootstrapResponse,
  GuiScheduleResponse,
  GuiConversationMessagesResponse,
  GuiConversationsResponse,
  GuiCreateInstanceRequest,
  GuiCreateInstanceResponse,
  GuiDeleteSecretRequest,
  GuiDeleteSecretResponse,
  GuiInstancesResponse,
  GuiLlmCheckResponse,
  GuiQueueResponse,
  GuiSecretsResponse,
  GuiSignInInstanceRequest,
  GuiSignInInstanceResponse,
  GuiWalletsResponse,
  GuiUpsertSecretRequest,
  GuiUpsertSecretResponse,
  GuiUpdateVaultRequest,
  GuiUpdateVaultResponse,
  GuiVaultResponse,
} from "@trenchclaw/types";
import { GUI_API_BASE_PATH, REQUEST_TIMEOUT_MS } from "./config";

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
  bootstrap: (): Promise<GuiBootstrapResponse> => fetchJson<GuiBootstrapResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/bootstrap`)),
  queue: (): Promise<GuiQueueResponse> => fetchJson<GuiQueueResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/queue`)),
  schedule: (): Promise<GuiScheduleResponse> => fetchJson<GuiScheduleResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/schedule`)),
  activity: (limit = 100): Promise<GuiActivityResponse> =>
    fetchJson<GuiActivityResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/activity?limit=${Math.max(1, Math.trunc(limit))}`)),
  conversations: (limit = 100): Promise<GuiConversationsResponse> =>
    fetchJson<GuiConversationsResponse>(
      toRuntimeUrl(`${GUI_API_BASE_PATH}/conversations?limit=${Math.max(1, Math.trunc(limit))}`),
    ),
  conversationMessages: (conversationId: string, limit = 500): Promise<GuiConversationMessagesResponse> =>
    fetchJson<GuiConversationMessagesResponse>(
      toRuntimeUrl(
        `${GUI_API_BASE_PATH}/conversations/${encodeURIComponent(conversationId)}/messages?limit=${Math.max(1, Math.trunc(limit))}`,
      ),
    ),
  instances: (): Promise<GuiInstancesResponse> => fetchJson<GuiInstancesResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/instances`)),
  createInstance: (input: GuiCreateInstanceRequest): Promise<GuiCreateInstanceResponse> =>
    fetchJson<GuiCreateInstanceResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/instances`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  signInInstance: (input: GuiSignInInstanceRequest): Promise<GuiSignInInstanceResponse> =>
    fetchJson<GuiSignInInstanceResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/instances/sign-in`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  aiSettings: (): Promise<GuiAiSettingsResponse> => fetchJson<GuiAiSettingsResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/ai-settings`)),
  updateAiSettings: (input: GuiUpdateAiSettingsRequest): Promise<GuiUpdateAiSettingsResponse> =>
    fetchJson<GuiUpdateAiSettingsResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/ai-settings`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  vault: (): Promise<GuiVaultResponse> => fetchJson<GuiVaultResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/vault`)),
  updateVault: (input: GuiUpdateVaultRequest): Promise<GuiUpdateVaultResponse> =>
    fetchJson<GuiUpdateVaultResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/vault`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  secrets: (): Promise<GuiSecretsResponse> => fetchJson<GuiSecretsResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/secrets`)),
  upsertSecret: (input: GuiUpsertSecretRequest): Promise<GuiUpsertSecretResponse> =>
    fetchJson<GuiUpsertSecretResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/secrets`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  deleteSecret: (input: GuiDeleteSecretRequest): Promise<GuiDeleteSecretResponse> =>
    fetchJson<GuiDeleteSecretResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/secrets`), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  llmCheck: (): Promise<GuiLlmCheckResponse> => fetchJson<GuiLlmCheckResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/llm/check`)),
  wallets: (): Promise<GuiWalletsResponse> => fetchJson<GuiWalletsResponse>(toRuntimeUrl(`${GUI_API_BASE_PATH}/wallets`)),
  walletBackupDownloadUrl: (relativePath: string): string =>
    toRuntimeUrl(`${GUI_API_BASE_PATH}/wallets/download?path=${encodeURIComponent(relativePath)}`),
  reportClientError: (input: {
    source: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ ok: true }> =>
    fetchJson<{ ok: true }>(toRuntimeUrl(`${GUI_API_BASE_PATH}/client-error`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};
