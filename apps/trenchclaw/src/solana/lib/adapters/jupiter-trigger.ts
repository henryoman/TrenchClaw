import {
  formatUltraError,
  normalizeAmount,
  parseUltraJson,
  resolveRequestId,
  resolveSwapTransaction,
} from "../ultra/parsing";
import { getJupiterUltraApiKeyFromVault } from "./jupiter-ultra";

const DEFAULT_JUPITER_TRIGGER_BASE_URL = "https://api.jup.ag/trigger/v1";

export type JupiterTriggerOrderStatus = "active" | "history";
export type JupiterTriggerComputeUnitPrice = "auto" | string | number;

export interface JupiterTriggerCreateOrderRequest {
  inputMint: string;
  outputMint: string;
  maker: string;
  payer: string;
  params: {
    makingAmount: bigint | number | string;
    takingAmount: bigint | number | string;
    expiredAt?: number | string;
    slippageBps?: number;
    feeBps?: number;
  };
  computeUnitPrice?: JupiterTriggerComputeUnitPrice;
  feeAccount?: string;
  wrapAndUnwrapSol?: boolean;
}

export interface JupiterTriggerCreateOrderResponse {
  requestId: string;
  transaction: string;
  order?: string;
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

export interface JupiterTriggerGetOrdersRequest {
  user: string;
  orderStatus: JupiterTriggerOrderStatus;
  page?: number;
  inputMint?: string;
  outputMint?: string;
  includeFailedTx?: boolean;
}

export interface JupiterTriggerGetOrdersResponse {
  user?: string;
  orderStatus: JupiterTriggerOrderStatus;
  page: number;
  hasMoreData: boolean;
  orders: unknown[];
  raw: unknown;
  [key: string]: unknown;
}

export interface JupiterTriggerCancelOrderRequest {
  maker: string;
  order: string;
  computeUnitPrice?: JupiterTriggerComputeUnitPrice;
}

export interface JupiterTriggerCancelOrderResponse {
  requestId: string;
  transaction: string;
  raw: unknown;
  [key: string]: unknown;
}

export interface JupiterTriggerCancelOrdersRequest {
  maker: string;
  orders?: string[];
  computeUnitPrice?: JupiterTriggerComputeUnitPrice;
}

export interface JupiterTriggerCancelOrdersResponse {
  requestId: string;
  transactions: string[];
  raw: unknown;
  [key: string]: unknown;
}

export interface JupiterTriggerAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const readErrorMessage = (status: number, payload: unknown): string =>
  formatUltraError("Jupiter Trigger request failed", status, payload);

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const normalizeComputeUnitPrice = (value: JupiterTriggerComputeUnitPrice | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === "auto") {
    return value;
  }
  return String(value).trim();
};

const resolveTransactions = (payload: unknown): string[] => {
  const record = toRecord(payload);
  const direct = record.transactions;

  if (Array.isArray(direct)) {
    return direct.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }

  const single = resolveSwapTransaction(payload);
  return single ? [single] : [];
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
    const payload = await parseUltraJson(response);

    if (!response.ok) {
      throw new Error(readErrorMessage(response.status, payload));
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
        body: JSON.stringify({
          inputMint: createRequest.inputMint,
          outputMint: createRequest.outputMint,
          maker: createRequest.maker,
          payer: createRequest.payer,
          params: {
            makingAmount: normalizeAmount(createRequest.params.makingAmount),
            takingAmount: normalizeAmount(createRequest.params.takingAmount),
            ...(createRequest.params.expiredAt === undefined
              ? {}
              : { expiredAt: Number(createRequest.params.expiredAt) }),
            ...(createRequest.params.slippageBps === undefined
              ? {}
              : { slippageBps: createRequest.params.slippageBps }),
            ...(createRequest.params.feeBps === undefined ? {} : { feeBps: createRequest.params.feeBps }),
          },
          ...(normalizeComputeUnitPrice(createRequest.computeUnitPrice)
            ? { computeUnitPrice: normalizeComputeUnitPrice(createRequest.computeUnitPrice) }
            : {}),
          ...(createRequest.feeAccount ? { feeAccount: createRequest.feeAccount } : {}),
          ...(createRequest.wrapAndUnwrapSol === undefined
            ? {}
            : { wrapAndUnwrapSol: createRequest.wrapAndUnwrapSol }),
        }),
      });

      const requestId = resolveRequestId(payload);
      if (!requestId) {
        throw new Error("Trigger createOrder response is missing requestId");
      }

      const transaction = resolveSwapTransaction(payload);
      if (!transaction) {
        throw new Error("Trigger createOrder response is missing transaction");
      }

      const record = toRecord(payload);
      return {
        ...record,
        requestId,
        transaction,
        order: typeof record.order === "string" ? record.order : undefined,
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

      const record = toRecord(payload);
      return {
        ...record,
        status: typeof record.status === "string" ? record.status : "Unknown",
        signature: typeof record.signature === "string" ? record.signature : undefined,
        raw: payload,
      };
    },
    getTriggerOrders: async (
      query: JupiterTriggerGetOrdersRequest,
    ): Promise<JupiterTriggerGetOrdersResponse> => {
      const params = new URLSearchParams({
        user: query.user,
        orderStatus: query.orderStatus,
      });

      if (typeof query.page === "number") {
        params.set("page", String(query.page));
      }
      if (query.inputMint) {
        params.set("inputMint", query.inputMint);
      }
      if (query.outputMint) {
        params.set("outputMint", query.outputMint);
      }
      if (typeof query.includeFailedTx === "boolean") {
        params.set("includeFailedTx", String(query.includeFailedTx));
      }

      const payload = await request(`/getTriggerOrders?${params.toString()}`);
      const record = toRecord(payload);
      const orders = Array.isArray(record.orders) ? record.orders : [];

      return {
        ...record,
        user: typeof record.user === "string" ? record.user : undefined,
        orderStatus: query.orderStatus,
        page: query.page ?? 1,
        hasMoreData: record.hasMoreData === true,
        orders,
        raw: payload,
      };
    },
    cancelOrder: async (
      cancelRequest: JupiterTriggerCancelOrderRequest,
    ): Promise<JupiterTriggerCancelOrderResponse> => {
      const payload = await request("/cancelOrder", {
        method: "POST",
        body: JSON.stringify({
          maker: cancelRequest.maker,
          order: cancelRequest.order,
          ...(normalizeComputeUnitPrice(cancelRequest.computeUnitPrice)
            ? { computeUnitPrice: normalizeComputeUnitPrice(cancelRequest.computeUnitPrice) }
            : {}),
        }),
      });

      const requestId = resolveRequestId(payload);
      if (!requestId) {
        throw new Error("Trigger cancelOrder response is missing requestId");
      }

      const transaction = resolveSwapTransaction(payload);
      if (!transaction) {
        throw new Error("Trigger cancelOrder response is missing transaction");
      }

      return {
        ...toRecord(payload),
        requestId,
        transaction,
        raw: payload,
      };
    },
    cancelOrders: async (
      cancelRequest: JupiterTriggerCancelOrdersRequest,
    ): Promise<JupiterTriggerCancelOrdersResponse> => {
      const payload = await request("/cancelOrders", {
        method: "POST",
        body: JSON.stringify({
          maker: cancelRequest.maker,
          ...(cancelRequest.orders ? { orders: cancelRequest.orders } : {}),
          ...(normalizeComputeUnitPrice(cancelRequest.computeUnitPrice)
            ? { computeUnitPrice: normalizeComputeUnitPrice(cancelRequest.computeUnitPrice) }
            : {}),
        }),
      });

      const requestId = resolveRequestId(payload);
      if (!requestId) {
        throw new Error("Trigger cancelOrders response is missing requestId");
      }

      const transactions = resolveTransactions(payload);
      if (!transactions.length) {
        throw new Error("Trigger cancelOrders response is missing transactions");
      }

      return {
        ...toRecord(payload),
        requestId,
        transactions,
        raw: payload,
      };
    },
  };
};

export const resolveJupiterTriggerApiKey = async (): Promise<string | undefined> => {
  return getJupiterUltraApiKeyFromVault();
};

export const createJupiterTriggerAdapterFromConfig = async () => {
  const apiKey = await resolveJupiterTriggerApiKey();

  if (!apiKey) {
    return undefined;
  }

  return createJupiterTriggerAdapter({ apiKey });
};

export type JupiterTriggerAdapter = ReturnType<typeof createJupiterTriggerAdapter>;
