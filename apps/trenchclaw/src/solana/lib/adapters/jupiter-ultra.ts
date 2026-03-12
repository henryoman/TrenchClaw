import {
  formatUltraError,
  normalizeAmount,
  parseUltraJson,
  resolveRequestId,
  resolveSwapTransaction,
} from "../ultra/parsing";
import { parseStructuredFile, resolvePathFromModule } from "../../../ai/llm/shared";
import { ensureVaultFileExists } from "../../../ai/llm/vault-file";
import { RUNTIME_USER_ROOT, resolveCoreRelativePath } from "../../../runtime/runtime-paths";

const DEFAULT_JUPITER_ULTRA_BASE_URL = "https://api.jup.ag/ultra/v1";
const DEFAULT_VAULT_FILE = `${RUNTIME_USER_ROOT}/vault.json`;
const DEFAULT_VAULT_TEMPLATE_FILE = resolveCoreRelativePath("src/ai/config/vault.template.json");
const VAULT_FILE_ENV = "TRENCHCLAW_VAULT_FILE";
const VAULT_TEMPLATE_FILE_ENV = "TRENCHCLAW_VAULT_TEMPLATE_FILE";

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

const getByPath = (root: unknown, segments: string[]): unknown => {
  let current = root;
  for (const segment of segments) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const readVaultString = (root: unknown, refPath: string): string | undefined => {
  const value = getByPath(root, refPath.split("/").filter(Boolean));
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

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
  const vaultPath = resolvePathFromModule(import.meta.url, DEFAULT_VAULT_FILE, process.env[VAULT_FILE_ENV]);
  const vaultTemplatePath = resolvePathFromModule(
    import.meta.url,
    DEFAULT_VAULT_TEMPLATE_FILE,
    process.env[VAULT_TEMPLATE_FILE_ENV],
  );
  await ensureVaultFileExists({
    vaultPath,
    templatePath: vaultTemplatePath,
  });
  const vaultData = await parseStructuredFile(vaultPath);
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
