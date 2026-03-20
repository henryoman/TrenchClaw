import { loadVaultData, readVaultString } from "../../../ai/llm/vault-file";

const DEFAULT_JUPITER_TRIGGER_BASE_URL = "https://api.jup.ag/trigger/v1";

export interface JupiterTriggerAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface JupiterTriggerCreateOrderRequest {
  inputMint: string;
  outputMint: string;
  maker: string;
  payer: string;
  params: {
    makingAmount: string;
    takingAmount: string;
    expiredAt?: number;
  };
  computeUnitPrice?: string;
}

export interface JupiterTriggerCreateOrderResponse {
  requestId: string;
  transaction: string;
  order: string;
  raw: unknown;
  [key: string]: unknown;
}

export interface JupiterTriggerExecuteRequest {
  requestId: string;
  signedTransaction: string;
}

export interface JupiterTriggerExecuteResponse {
  status: string;
  signature?: string;
  raw: unknown;
  [key: string]: unknown;
}

export interface JupiterTriggerCancelOrdersRequest {
  maker: string;
  orders: string[];
  computeUnitPrice?: string;
}

export interface JupiterTriggerCancelOrdersResponse {
  requestId: string;
  transactions: string[];
  raw: unknown;
  [key: string]: unknown;
}

export interface JupiterTriggerGetOrdersRequest {
  user: string;
  orderStatus: "active" | "history";
  page?: number;
  inputMint?: string;
  outputMint?: string;
  includeFailedTx?: boolean;
}

export interface JupiterTriggerGetOrdersResponse {
  user?: string;
  orderStatus?: string;
  orders?: unknown[];
  page?: number;
  totalPages?: number;
  raw: unknown;
  [key: string]: unknown;
}

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const formatError = (prefix: string, status: number, payload: unknown): string => {
  const base = `${prefix}: ${status}`;
  if (!payload) {
    return base;
  }
  if (typeof payload === "string") {
    return `${base} ${payload}`;
  }
  try {
    return `${base} ${JSON.stringify(payload)}`;
  } catch {
    return base;
  }
};

const resolveString = (payload: unknown, keys: string[]): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
};

const resolveTransactions = (payload: unknown): string[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const transactions = (payload as Record<string, unknown>).transactions;
  if (!Array.isArray(transactions)) {
    return [];
  }
  return transactions.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
};

const toQueryParams = (request: JupiterTriggerGetOrdersRequest): URLSearchParams => {
  const params = new URLSearchParams({
    user: request.user,
    orderStatus: request.orderStatus,
    page: String(Math.max(1, request.page ?? 1)),
  });

  if (request.inputMint) {
    params.set("inputMint", request.inputMint);
  }
  if (request.outputMint) {
    params.set("outputMint", request.outputMint);
  }
  if (typeof request.includeFailedTx === "boolean") {
    params.set("includeFailedTx", request.includeFailedTx ? "true" : "false");
  }

  return params;
};

export const createJupiterTriggerAdapter = (config: JupiterTriggerAdapterConfig) => {
  const baseUrl = config.baseUrl ?? DEFAULT_JUPITER_TRIGGER_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    headers.set("x-api-key", config.apiKey);

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      throw new Error(formatError("Jupiter Trigger request failed", response.status, payload));
    }
    return payload;
  };

  return {
    baseUrl,
    createOrder: async (
      createRequest: JupiterTriggerCreateOrderRequest,
    ): Promise<JupiterTriggerCreateOrderResponse> => {
      const payload = await request("/createOrder", {
        method: "POST",
        body: JSON.stringify(createRequest),
      });
      const requestId = resolveString(payload, ["requestId", "id"]);
      const transaction = resolveString(payload, ["transaction"]);
      const order = resolveString(payload, ["order", "orderKey"]);

      if (!requestId) {
        throw new Error("Trigger createOrder response is missing requestId");
      }
      if (!transaction) {
        throw new Error("Trigger createOrder response is missing transaction");
      }
      if (!order) {
        throw new Error("Trigger createOrder response is missing order");
      }

      return {
        ...(payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}),
        requestId,
        transaction,
        order,
        raw: payload,
      };
    },
    executeOrder: async (
      executeRequest: JupiterTriggerExecuteRequest,
      options?: { signal?: AbortSignal },
    ): Promise<JupiterTriggerExecuteResponse> => {
      const payload = await request("/execute", {
        method: "POST",
        body: JSON.stringify(executeRequest),
        signal: options?.signal,
      });
      const payloadRecord = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
      const status =
        payloadRecord && typeof payloadRecord.status === "string"
          ? payloadRecord.status
          : "Unknown";
      const signature =
        payloadRecord && typeof payloadRecord.signature === "string"
          ? payloadRecord.signature
          : undefined;

      return {
        ...payloadRecord,
        status,
        signature,
        raw: payload,
      };
    },
    cancelOrders: async (
      cancelRequest: JupiterTriggerCancelOrdersRequest,
    ): Promise<JupiterTriggerCancelOrdersResponse> => {
      const payload = await request("/cancelOrders", {
        method: "POST",
        body: JSON.stringify(cancelRequest),
      });
      const requestId = resolveString(payload, ["requestId", "id"]);
      if (!requestId) {
        throw new Error("Trigger cancelOrders response is missing requestId");
      }
      const transactions = resolveTransactions(payload);
      if (transactions.length === 0) {
        throw new Error("Trigger cancelOrders response is missing transactions");
      }

      return {
        ...(payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}),
        requestId,
        transactions,
        raw: payload,
      };
    },
    getTriggerOrders: async (
      getOrdersRequest: JupiterTriggerGetOrdersRequest,
    ): Promise<JupiterTriggerGetOrdersResponse> => {
      const payload = await request(`/getTriggerOrders?${toQueryParams(getOrdersRequest).toString()}`);
      const payloadRecord = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      return {
        ...payloadRecord,
        raw: payload,
      };
    },
  };
};

export const getJupiterTriggerApiKeyFromVault = async (): Promise<string | undefined> => {
  const { vaultData } = await loadVaultData();
  return readVaultString(vaultData, "integrations/jupiter/api-key");
};

export const resolveJupiterTriggerApiKey = async (): Promise<string | undefined> => {
  return getJupiterTriggerApiKeyFromVault();
};

export const createJupiterTriggerAdapterFromConfig = async () => {
  const apiKey = await resolveJupiterTriggerApiKey();

  if (!apiKey) {
    return undefined;
  }

  return createJupiterTriggerAdapter({ apiKey });
};

export type JupiterTriggerAdapter = ReturnType<typeof createJupiterTriggerAdapter>;
