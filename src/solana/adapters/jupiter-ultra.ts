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
  taker: string;
  mode?: "ExactIn" | "ExactOut";
  referralAccount?: string;
  referralFee?: number;
}

export interface JupiterUltraOrderResponse {
  requestId: string;
  transaction: string;
  [key: string]: unknown;
}

export interface JupiterUltraExecuteRequest {
  requestId: string;
  signedTransaction: string;
}

export interface JupiterUltraExecuteResponse {
  status: string;
  signature?: string;
  [key: string]: unknown;
}

const normalizeAmount = (amount: bigint | number | string): string => {
  if (typeof amount === "bigint") {
    return amount.toString(10);
  }

  return String(amount);
};

const toQueryParams = (request: JupiterUltraOrderRequest): URLSearchParams => {
  const params = new URLSearchParams({
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: normalizeAmount(request.amount),
    taker: request.taker,
  });

  if (request.mode) {
    params.set("mode", request.mode);
  }

  if (request.referralAccount) {
    params.set("referralAccount", request.referralAccount);
  }

  if (typeof request.referralFee === "number") {
    params.set("referralFee", String(request.referralFee));
  }

  return params;
};

const readErrorMessage = async (response: Response): Promise<string> => {
  const responseText = await response.text();

  if (!responseText) {
    return `Jupiter Ultra request failed (${response.status})`;
  }

  return `Jupiter Ultra request failed (${response.status}): ${responseText}`;
};

export const createJupiterUltraAdapter = (config: JupiterUltraAdapterConfig) => {
  const baseUrl = config.baseUrl ?? DEFAULT_JUPITER_ULTRA_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    headers.set("x-api-key", config.apiKey);

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return (await response.json()) as T;
  };

  return {
    baseUrl,
    getOrder: (orderRequest: JupiterUltraOrderRequest): Promise<JupiterUltraOrderResponse> => {
      const queryParams = toQueryParams(orderRequest);
      return request<JupiterUltraOrderResponse>(`/order?${queryParams.toString()}`);
    },
    executeOrder: (
      executeRequest: JupiterUltraExecuteRequest,
    ): Promise<JupiterUltraExecuteResponse> => {
      return request<JupiterUltraExecuteResponse>("/execute", {
        method: "POST",
        body: JSON.stringify(executeRequest),
      });
    },
  };
};

export const getJupiterUltraApiKeyFromEnv = (): string | undefined => {
  return Bun.env.JUPITER_ULTRA_API_KEY ?? Bun.env.JUPITER_API_KEY;
};

export const createJupiterUltraAdapterFromEnv = () => {
  const apiKey = getJupiterUltraApiKeyFromEnv();

  if (!apiKey) {
    return undefined;
  }

  return createJupiterUltraAdapter({ apiKey });
};

export type JupiterUltraAdapter = ReturnType<typeof createJupiterUltraAdapter>;
