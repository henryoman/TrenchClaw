const GECKOTERMINAL_API_BASE_URL = "https://api.geckoterminal.com/api/v2";
const GECKOTERMINAL_SOLANA_NETWORK = "solana";
const GECKOTERMINAL_ACCEPT_HEADER = "application/json;version=20230203";
const GECKOTERMINAL_REQUEST_TIMEOUT_MS = 15_000;
const GECKOTERMINAL_MAX_RETRIES = 2;
const GECKOTERMINAL_RETRY_BACKOFF_MS = 1_000;
const GECKOTERMINAL_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface GeckoTerminalRequestOptions {
  signal?: AbortSignal;
}

interface GeckoTerminalRequestErrorOptions {
  retryable: boolean;
  status?: number;
  cause?: unknown;
}

export interface GeckoTerminalPoolOhlcvRequest {
  poolAddress: string;
  timeframe: "minute" | "hour" | "day";
  aggregate?: number;
  beforeTimestamp?: number;
  limit?: number;
  currency?: "usd" | "token";
  includeEmptyIntervals?: boolean;
  token?: string;
  options?: GeckoTerminalRequestOptions;
}

export interface GeckoTerminalPoolOhlcvResponse {
  requestUrl: string;
  payload: JsonObject;
}

class GeckoTerminalRequestError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, options: GeckoTerminalRequestErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "GeckoTerminalRequestError";
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

const assertNonEmptyParam = (name: string, value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`GeckoTerminal invocation error: "${name}" cannot be empty.`);
  }
  return normalized;
};

const isJsonObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const getRequestSignal = (requestOptions: GeckoTerminalRequestOptions): AbortSignal => {
  const timeoutSignal = AbortSignal.timeout(GECKOTERMINAL_REQUEST_TIMEOUT_MS);
  return requestOptions.signal ? AbortSignal.any([requestOptions.signal, timeoutSignal]) : timeoutSignal;
};

const isCallerAbort = (requestOptions: GeckoTerminalRequestOptions): boolean =>
  requestOptions.signal?.aborted === true;

const toGeckoTerminalRequestError = (input: {
  error: unknown;
  url: string;
  requestOptions: GeckoTerminalRequestOptions;
}): GeckoTerminalRequestError => {
  if (input.error instanceof GeckoTerminalRequestError) {
    return input.error;
  }

  if (isCallerAbort(input.requestOptions)) {
    return new GeckoTerminalRequestError(`GeckoTerminal request was aborted for ${input.url}`, {
      retryable: false,
      cause: input.error,
    });
  }

  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const normalized = message.toLowerCase();
  const timedOut = normalized.includes("timed out") || normalized.includes("timeout") || normalized.includes("abort");

  return new GeckoTerminalRequestError(
    timedOut
      ? `GeckoTerminal request timed out after ${GECKOTERMINAL_REQUEST_TIMEOUT_MS}ms for ${input.url}`
      : `GeckoTerminal request failed for ${input.url}: ${message}`,
    {
      retryable: true,
      cause: input.error,
    },
  );
};

const shouldRetryError = (
  error: GeckoTerminalRequestError,
  requestOptions: GeckoTerminalRequestOptions,
  attempt: number,
): boolean =>
  error.retryable && attempt < GECKOTERMINAL_MAX_RETRIES && !requestOptions.signal?.aborted;

const getRetryDelayMs = (response: Response, attempt: number): number => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.round(retryAfterSeconds * 1000);
    }

    const retryAfterDate = Date.parse(retryAfter);
    if (Number.isFinite(retryAfterDate)) {
      return Math.max(0, retryAfterDate - Date.now());
    }
  }

  return GECKOTERMINAL_RETRY_BACKOFF_MS * (attempt + 1);
};

const assertJsonObjectResponse = (payload: unknown, url: string): JsonObject => {
  if (!isJsonObject(payload)) {
    throw new GeckoTerminalRequestError(
      `GeckoTerminal returned an invalid response shape for ${url}: expected a JSON object.`,
      { retryable: false },
    );
  }
  return payload;
};

async function fetchGeckoTerminalJson(
  url: string,
  requestOptions: GeckoTerminalRequestOptions = {},
  attempt = 0,
): Promise<JsonObject> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: GECKOTERMINAL_ACCEPT_HEADER,
      },
      signal: getRequestSignal(requestOptions),
    });

    if (!response.ok) {
      const error = new GeckoTerminalRequestError(
        `GeckoTerminal request failed (${response.status} ${response.statusText}) for ${url}`,
        {
          retryable: GECKOTERMINAL_RETRYABLE_STATUS_CODES.has(response.status),
          status: response.status,
        },
      );
      if (shouldRetryError(error, requestOptions, attempt)) {
        await Bun.sleep(getRetryDelayMs(response, attempt));
        return fetchGeckoTerminalJson(url, requestOptions, attempt + 1);
      }
      throw error;
    }

    try {
      return assertJsonObjectResponse(await response.json(), url);
    } catch (error) {
      throw new GeckoTerminalRequestError(`GeckoTerminal returned invalid JSON for ${url}`, {
        retryable: false,
        cause: error,
      });
    }
  } catch (error) {
    const requestError = toGeckoTerminalRequestError({
      error,
      url,
      requestOptions,
    });
    if (shouldRetryError(requestError, requestOptions, attempt)) {
      await Bun.sleep(GECKOTERMINAL_RETRY_BACKOFF_MS * (attempt + 1));
      return fetchGeckoTerminalJson(url, requestOptions, attempt + 1);
    }
    throw requestError;
  }
}

const buildOhlcvUrl = (input: GeckoTerminalPoolOhlcvRequest): string => {
  const poolAddress = assertNonEmptyParam("poolAddress", input.poolAddress);
  const searchParams = new URLSearchParams();

  if (typeof input.aggregate === "number") {
    searchParams.set("aggregate", String(input.aggregate));
  }
  if (typeof input.beforeTimestamp === "number") {
    searchParams.set("before_timestamp", String(input.beforeTimestamp));
  }
  if (typeof input.limit === "number") {
    searchParams.set("limit", String(input.limit));
  }
  if (input.currency) {
    searchParams.set("currency", input.currency);
  }
  if (typeof input.includeEmptyIntervals === "boolean") {
    searchParams.set("include_empty_intervals", String(input.includeEmptyIntervals));
  }
  if (input.token) {
    searchParams.set("token", assertNonEmptyParam("token", input.token));
  }

  const query = searchParams.toString();
  const path = `/networks/${GECKOTERMINAL_SOLANA_NETWORK}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${input.timeframe}`;
  return `${GECKOTERMINAL_API_BASE_URL}${path}${query ? `?${query}` : ""}`;
};

export async function getGeckoTerminalPoolOhlcv(
  input: GeckoTerminalPoolOhlcvRequest,
): Promise<GeckoTerminalPoolOhlcvResponse> {
  const requestUrl = buildOhlcvUrl(input);
  const payload = await fetchGeckoTerminalJson(requestUrl, input.options);
  return {
    requestUrl,
    payload,
  };
}

export function isGeckoTerminalRetryableError(error: unknown): boolean {
  return error instanceof GeckoTerminalRequestError && error.retryable;
}
