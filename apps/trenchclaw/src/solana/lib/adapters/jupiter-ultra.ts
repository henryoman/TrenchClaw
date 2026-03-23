import {
  formatUltraError,
  normalizeAmount,
  parseUltraJson,
  resolveRequestId,
  resolveSwapTransaction,
} from "../ultra/parsing";
import { resolveJupiterApiKey } from "./jupiter";

const DEFAULT_JUPITER_ULTRA_BASE_URL = "https://api.jup.ag/ultra/v1";

export interface JupiterUltraAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  rateLimitRetry?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterMs?: number;
    sleepImpl?: (ms: number) => Promise<void>;
  };
}

export interface JupiterUltraOrderRequest {
  inputMint: string;
  outputMint: string;
  amount: bigint | number | string;
  taker?: string;
  mode?: "ExactIn" | "ExactOut";
  swapMode?: "ExactIn" | "ExactOut";
  slippageBps?: number;
  referralAccount?: string;
  referralFee?: number;
}

export interface JupiterUltraOrderResponse {
  requestId: string;
  transaction: string | null;
  raw: unknown;
  [key: string]: unknown;
}

export interface JupiterUltraExecuteRequest {
  requestId: string;
  signedTransaction: string;
}

export interface JupiterUltraExecuteResponse {
  status: string;
  signature?: string;
  raw: unknown;
  [key: string]: unknown;
}

const toQueryParams = (request: JupiterUltraOrderRequest): URLSearchParams => {
  const params = new URLSearchParams({
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: normalizeAmount(request.amount),
  });

  if (request.taker) {
    params.set("taker", request.taker);
  }

  const swapMode = request.swapMode ?? request.mode;
  if (swapMode) {
    params.set("swapMode", swapMode);
  }

  if (typeof request.slippageBps === "number") {
    params.set("slippageBps", String(request.slippageBps));
  }

  if (request.referralAccount) {
    params.set("referralAccount", request.referralAccount);
  }

  if (typeof request.referralFee === "number") {
    params.set("referralFee", String(request.referralFee));
  }

  return params;
};

const readErrorMessage = (status: number, payload: unknown): string =>
  formatUltraError("Jupiter Ultra request failed", status, payload);

const parseRetryAfterMs = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, timestamp - Date.now());
};

const computeBackoffMs = (input: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}): number => {
  const exponentialDelay = input.baseDelayMs * 2 ** Math.max(0, input.attempt - 1);
  const jitter = input.jitterMs > 0 ? Math.floor(Math.random() * input.jitterMs) : 0;
  return Math.min(input.maxDelayMs, exponentialDelay + jitter);
};

export const createJupiterUltraAdapter = (config: JupiterUltraAdapterConfig) => {
  const baseUrl = config.baseUrl ?? DEFAULT_JUPITER_ULTRA_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;
  const maxAttempts = Math.max(1, Math.trunc(config.rateLimitRetry?.maxAttempts ?? 4));
  const baseDelayMs = Math.max(0, Math.trunc(config.rateLimitRetry?.baseDelayMs ?? 500));
  const maxDelayMs = Math.max(baseDelayMs || 1, Math.trunc(config.rateLimitRetry?.maxDelayMs ?? 10_000));
  const jitterMs = Math.max(0, Math.trunc(config.rateLimitRetry?.jitterMs ?? 250));
  const sleepImpl = config.rateLimitRetry?.sleepImpl ?? (async (ms: number) => await Bun.sleep(ms));

  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    headers.set("x-api-key", config.apiKey);
    headers.set("x-ultra-api-key", config.apiKey);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers,
      });
      const payload = await parseUltraJson(response);

      if (response.ok) {
        return payload;
      }

      const canRetry = response.status === 429 && attempt < maxAttempts;
      if (!canRetry) {
        throw new Error(readErrorMessage(response.status, payload));
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const backoffMs = computeBackoffMs({
        attempt,
        baseDelayMs,
        maxDelayMs,
        jitterMs,
      });
      await sleepImpl(Math.max(retryAfterMs ?? 0, backoffMs));
    }

    throw new Error("Jupiter Ultra request failed after exhausting rate-limit retries");
  };

  return {
    baseUrl,
    getOrder: (orderRequest: JupiterUltraOrderRequest): Promise<JupiterUltraOrderResponse> => {
      const queryParams = toQueryParams(orderRequest);
      return request(`/order?${queryParams.toString()}`).then((payload) => {
        const requestId = resolveRequestId(payload);
        if (!requestId) {
          throw new Error("Ultra order response is missing requestId");
        }

        const payloadRecord = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
        const explicitTransaction = payloadRecord?.transaction;
        const transaction =
          explicitTransaction == null || explicitTransaction === ""
            ? null
            : resolveSwapTransaction(payload);

        if (payloadRecord) {
          return {
            ...payloadRecord,
            requestId,
            transaction,
            raw: payload,
          };
        }

        return {
          requestId,
          transaction,
          raw: payload,
        };
      });
    },
    executeOrder: (
      executeRequest: JupiterUltraExecuteRequest,
      options?: { signal?: AbortSignal },
    ): Promise<JupiterUltraExecuteResponse> => {
      return request("/execute", {
        method: "POST",
        body: JSON.stringify(executeRequest),
        signal: options?.signal,
      }).then((payload) => {
        const payloadRecord = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
        const status =
          payloadRecord && typeof payloadRecord.status === "string"
            ? payloadRecord.status
            : "Unknown";
        const signature =
          payloadRecord && typeof payloadRecord.signature === "string"
            ? payloadRecord.signature
            : undefined;

        if (payloadRecord) {
          return {
            ...payloadRecord,
            status,
            signature,
            raw: payload,
          };
        }

        return {
          status,
          signature,
          raw: payload,
        };
      });
    },
  };
};

export { getJupiterApiKeyFromVault as getJupiterUltraApiKeyFromVault, resolveJupiterApiKey as resolveJupiterUltraApiKey } from "./jupiter";

export const createJupiterUltraAdapterFromConfig = async () => {
  const apiKey = await resolveJupiterApiKey();

  if (!apiKey) {
    return undefined;
  }

  return createJupiterUltraAdapter({ apiKey });
};

export type JupiterUltraAdapter = ReturnType<typeof createJupiterUltraAdapter>;
