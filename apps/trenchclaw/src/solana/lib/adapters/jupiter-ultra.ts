import {
  formatUltraError,
  normalizeAmount,
  parseUltraJson,
  resolveRequestId,
  resolveSwapTransaction,
} from "../ultra/parsing";
import { loadVaultData, readVaultString } from "../../../ai/llm/vault-file";

const DEFAULT_JUPITER_ULTRA_BASE_URL = "https://api.jup.ag/ultra/v1";

export interface JupiterUltraAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
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
  transaction: string;
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

export const createJupiterUltraAdapter = (config: JupiterUltraAdapterConfig) => {
  const baseUrl = config.baseUrl ?? DEFAULT_JUPITER_ULTRA_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    headers.set("x-api-key", config.apiKey);
    headers.set("x-ultra-api-key", config.apiKey);

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    const payload = await parseUltraJson(response);

    if (!response.ok) {
      throw new Error(readErrorMessage(response.status, payload));
    }

    return payload;
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

        const transaction = resolveSwapTransaction(payload);
        if (!transaction) {
          throw new Error("Ultra order response is missing transaction");
        }

        if (payload && typeof payload === "object") {
          return {
            ...(payload as Record<string, unknown>),
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

export const getJupiterUltraApiKeyFromVault = async (): Promise<string | undefined> => {
  const { vaultData } = await loadVaultData();
  return readVaultString(vaultData, "integrations/jupiter/api-key");
};

export const resolveJupiterUltraApiKey = async (): Promise<string | undefined> => {
  return getJupiterUltraApiKeyFromVault();
};

export const createJupiterUltraAdapterFromConfig = async () => {
  const apiKey = await resolveJupiterUltraApiKey();

  if (!apiKey) {
    return undefined;
  }

  return createJupiterUltraAdapter({ apiKey });
};

export type JupiterUltraAdapter = ReturnType<typeof createJupiterUltraAdapter>;
