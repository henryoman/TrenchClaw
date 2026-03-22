import { loadVaultData, readVaultString } from "../../../ai/llm/vault-file";

const DEFAULT_JUPITER_SWAP_V2_BASE_URL = "https://api.jup.ag/swap/v2";

export interface JupiterBuildInstructionAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface JupiterBuildInstruction {
  programId: string;
  accounts: JupiterBuildInstructionAccount[];
  data: string;
}

export interface JupiterBuildRequest {
  inputMint: string;
  outputMint: string;
  amount: bigint | number | string;
  taker: string;
  slippageBps?: number;
  payer?: string;
  wrapAndUnwrapSol?: boolean;
  blockhashSlotsToExpiry?: number;
}

export interface JupiterBuildResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold?: string;
  swapMode?: string;
  slippageBps?: number;
  routePlan: Array<Record<string, unknown>>;
  computeBudgetInstructions: JupiterBuildInstruction[];
  setupInstructions: JupiterBuildInstruction[];
  swapInstruction: JupiterBuildInstruction;
  cleanupInstruction: JupiterBuildInstruction | null;
  otherInstructions: JupiterBuildInstruction[];
  addressesByLookupTableAddress: Record<string, string[]> | null;
  blockhashWithMetadata: {
    blockhash: number[];
    lastValidBlockHeight: number;
  };
  raw: unknown;
  [key: string]: unknown;
}

export interface JupiterSwapAdapterConfig {
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

const normalizeAmount = (value: JupiterBuildRequest["amount"]): string => {
  if (typeof value === "bigint") {
    return value.toString(10);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new Error("Jupiter build amount must be a positive integer in native units.");
    }
    return String(value);
  }
  const normalized = value.trim();
  if (!/^[0-9]+$/u.test(normalized)) {
    throw new Error(`Jupiter build amount must be an integer string, received "${value}"`);
  }
  return normalized;
};

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

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

const formatSwapApiError = (status: number, payload: unknown): string => {
  if (payload && typeof payload === "object" && "error" in payload) {
    const errorMessage = (payload as { error?: unknown }).error;
    if (typeof errorMessage === "string" && errorMessage.trim().length > 0) {
      return `Jupiter Swap API request failed (${status}): ${errorMessage}`;
    }
  }
  if (typeof payload === "string" && payload.trim().length > 0) {
    return `Jupiter Swap API request failed (${status}): ${payload}`;
  }
  return `Jupiter Swap API request failed with HTTP ${status}`;
};

const toBuildQueryParams = (request: JupiterBuildRequest): URLSearchParams => {
  const params = new URLSearchParams({
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: normalizeAmount(request.amount),
    taker: request.taker,
  });

  if (typeof request.slippageBps === "number") {
    params.set("slippageBps", String(request.slippageBps));
  }

  if (request.payer) {
    params.set("payer", request.payer);
  }

  if (typeof request.wrapAndUnwrapSol === "boolean") {
    params.set("wrapAndUnwrapSol", String(request.wrapAndUnwrapSol));
  }

  if (typeof request.blockhashSlotsToExpiry === "number") {
    params.set("blockhashSlotsToExpiry", String(request.blockhashSlotsToExpiry));
  }

  return params;
};

export const createJupiterAdapter = (config: JupiterSwapAdapterConfig) => {
  const baseUrl = config.baseUrl ?? DEFAULT_JUPITER_SWAP_V2_BASE_URL;
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

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        // Rate-limit retries are intentionally sequential.
        // eslint-disable-next-line no-await-in-loop
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers,
      });
        // Rate-limit retries are intentionally sequential.
        // eslint-disable-next-line no-await-in-loop
      const payload = await parseJson(response);

      if (response.ok) {
        return payload;
      }

      const canRetry = response.status === 429 && attempt < maxAttempts;
      if (!canRetry) {
        throw new Error(formatSwapApiError(response.status, payload));
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const backoffMs = computeBackoffMs({
        attempt,
        baseDelayMs,
        maxDelayMs,
        jitterMs,
      });
      // Rate-limit retries are intentionally sequential.
      // eslint-disable-next-line no-await-in-loop
      await sleepImpl(Math.max(retryAfterMs ?? 0, backoffMs));
    }

    throw new Error("Jupiter Swap API request failed after exhausting rate-limit retries");
  };

  return {
    baseUrl,
    buildSwap: (buildRequest: JupiterBuildRequest): Promise<JupiterBuildResponse> => {
      const queryParams = toBuildQueryParams(buildRequest);
      return request(`/build?${queryParams.toString()}`).then((payload) => {
        if (!payload || typeof payload !== "object") {
          throw new Error("Jupiter build response was not an object");
        }

        const payloadRecord = payload as Record<string, unknown>;
        const swapInstruction = payloadRecord.swapInstruction;
        const blockhashWithMetadata = payloadRecord.blockhashWithMetadata;
        if (!swapInstruction || typeof swapInstruction !== "object") {
          throw new Error("Jupiter build response is missing swapInstruction");
        }
        if (!blockhashWithMetadata || typeof blockhashWithMetadata !== "object") {
          throw new Error("Jupiter build response is missing blockhashWithMetadata");
        }

        return {
          ...payloadRecord,
          inputMint: String(payloadRecord.inputMint ?? buildRequest.inputMint),
          outputMint: String(payloadRecord.outputMint ?? buildRequest.outputMint),
          inAmount: String(payloadRecord.inAmount ?? normalizeAmount(buildRequest.amount)),
          outAmount: String(payloadRecord.outAmount ?? ""),
          routePlan: Array.isArray(payloadRecord.routePlan)
            ? payloadRecord.routePlan.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
            : [],
          computeBudgetInstructions: Array.isArray(payloadRecord.computeBudgetInstructions)
            ? payloadRecord.computeBudgetInstructions as JupiterBuildInstruction[]
            : [],
          setupInstructions: Array.isArray(payloadRecord.setupInstructions)
            ? payloadRecord.setupInstructions as JupiterBuildInstruction[]
            : [],
          swapInstruction: swapInstruction as JupiterBuildInstruction,
          cleanupInstruction:
            payloadRecord.cleanupInstruction && typeof payloadRecord.cleanupInstruction === "object"
              ? payloadRecord.cleanupInstruction as JupiterBuildInstruction
              : null,
          otherInstructions: Array.isArray(payloadRecord.otherInstructions)
            ? payloadRecord.otherInstructions as JupiterBuildInstruction[]
            : [],
          addressesByLookupTableAddress:
            payloadRecord.addressesByLookupTableAddress && typeof payloadRecord.addressesByLookupTableAddress === "object"
              ? payloadRecord.addressesByLookupTableAddress as Record<string, string[]>
              : null,
          blockhashWithMetadata: blockhashWithMetadata as JupiterBuildResponse["blockhashWithMetadata"],
          raw: payload,
        };
      });
    },
  };
};

export const getJupiterApiKeyFromVault = async (): Promise<string | undefined> => {
  const { vaultData } = await loadVaultData();
  return readVaultString(vaultData, "integrations/jupiter/api-key");
};

export const resolveJupiterApiKey = async (): Promise<string | undefined> => {
  return getJupiterApiKeyFromVault();
};

export const createJupiterAdapterFromConfig = async () => {
  const apiKey = await resolveJupiterApiKey();
  if (!apiKey) {
    return undefined;
  }
  return createJupiterAdapter({ apiKey });
};

export type JupiterSwapAdapter = ReturnType<typeof createJupiterAdapter>;
