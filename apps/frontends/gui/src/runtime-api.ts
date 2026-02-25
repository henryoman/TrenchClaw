import type {
  GuiActivityResponse,
  GuiBootstrapResponse,
  GuiChatRequest,
  GuiChatResponse,
  GuiCreateInstanceRequest,
  GuiCreateInstanceResponse,
  GuiInstancesResponse,
  GuiQueueResponse,
  GuiSignInInstanceRequest,
  GuiSignInInstanceResponse,
} from "@trenchclaw/types";

const runtimeBaseUrl = (import.meta.env.VITE_TRENCHCLAW_RUNTIME_URL ?? "").trim().replace(/\/+$/u, "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const toRuntimeUrl = (pathname: string): string => `${runtimeBaseUrl}${pathname}`;
const REQUEST_TIMEOUT_MS = 8000;

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
      throw new Error(`Runtime request timed out after ${REQUEST_TIMEOUT_MS}ms`);
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
  bootstrap: (): Promise<GuiBootstrapResponse> => fetchJson<GuiBootstrapResponse>(toRuntimeUrl("/api/gui/bootstrap")),
  queue: (): Promise<GuiQueueResponse> => fetchJson<GuiQueueResponse>(toRuntimeUrl("/api/gui/queue")),
  activity: (limit = 100): Promise<GuiActivityResponse> =>
    fetchJson<GuiActivityResponse>(toRuntimeUrl(`/api/gui/activity?limit=${Math.max(1, Math.trunc(limit))}`)),
  chat: (message: string): Promise<GuiChatResponse> =>
    fetchJson<GuiChatResponse>(toRuntimeUrl("/api/gui/chat"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message } satisfies GuiChatRequest),
    }),
  instances: (): Promise<GuiInstancesResponse> => fetchJson<GuiInstancesResponse>(toRuntimeUrl("/api/gui/instances")),
  createInstance: (input: GuiCreateInstanceRequest): Promise<GuiCreateInstanceResponse> =>
    fetchJson<GuiCreateInstanceResponse>(toRuntimeUrl("/api/gui/instances"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  signInInstance: (input: GuiSignInInstanceRequest): Promise<GuiSignInInstanceResponse> =>
    fetchJson<GuiSignInInstanceResponse>(toRuntimeUrl("/api/gui/instances/sign-in"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};
