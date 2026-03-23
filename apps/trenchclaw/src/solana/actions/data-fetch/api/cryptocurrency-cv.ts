const CRYPTOCURRENCY_CV_API_BASE_URL = "https://cryptocurrency.cv";
const CRYPTOCURRENCY_CV_REQUEST_TIMEOUT_MS = 15_000;
const CRYPTOCURRENCY_CV_MAX_RETRIES = 2;
const CRYPTOCURRENCY_CV_RETRY_BACKOFF_MS = 1_000;
const CRYPTOCURRENCY_CV_RETRYABLE_STATUS_CODES = new Set([403, 408, 429, 500, 502, 503, 504]);
const CRYPTOCURRENCY_CV_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

export interface CryptocurrencyCvRequestOptions {
  signal?: AbortSignal;
}

export interface CryptocurrencyCvJsonResponse {
  requestUrl: string;
  payload: unknown;
}

interface CryptocurrencyCvRequestErrorOptions {
  retryable: boolean;
  status?: number;
  cause?: unknown;
}

interface CryptocurrencyCvRequestInput {
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  options?: CryptocurrencyCvRequestOptions;
}

class CryptocurrencyCvRequestError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, options: CryptocurrencyCvRequestErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "CryptocurrencyCvRequestError";
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

const assertNonEmptyParam = (name: string, value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Crypto News API invocation error: "${name}" cannot be empty.`);
  }
  return normalized;
};

const buildRequestUrl = (input: CryptocurrencyCvRequestInput): string => {
  const url = new URL(input.path, CRYPTOCURRENCY_CV_API_BASE_URL);
  const queryEntries = Object.entries(input.query ?? {});
  for (const [key, value] of queryEntries) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const getRequestSignal = (requestOptions: CryptocurrencyCvRequestOptions): AbortSignal => {
  const timeoutSignal = AbortSignal.timeout(CRYPTOCURRENCY_CV_REQUEST_TIMEOUT_MS);
  return requestOptions.signal ? AbortSignal.any([requestOptions.signal, timeoutSignal]) : timeoutSignal;
};

const isCallerAbort = (requestOptions: CryptocurrencyCvRequestOptions): boolean =>
  requestOptions.signal?.aborted === true;

const extractErrorSnippet = (bodyText: string): string | null => {
  const normalized = bodyText
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized ? normalized.slice(0, 240) : null;
};

const toCryptocurrencyCvRequestError = (input: {
  error: unknown;
  path: string;
  requestOptions: CryptocurrencyCvRequestOptions;
}): CryptocurrencyCvRequestError => {
  if (input.error instanceof CryptocurrencyCvRequestError) {
    return input.error;
  }

  if (isCallerAbort(input.requestOptions)) {
    return new CryptocurrencyCvRequestError(`Crypto News API request was aborted for ${input.path}`, {
      retryable: false,
      cause: input.error,
    });
  }

  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const normalized = message.toLowerCase();
  const timedOut = normalized.includes("timed out") || normalized.includes("timeout") || normalized.includes("abort");

  return new CryptocurrencyCvRequestError(
    timedOut
      ? `Crypto News API request timed out after ${CRYPTOCURRENCY_CV_REQUEST_TIMEOUT_MS}ms for ${input.path}`
      : `Crypto News API request failed for ${input.path}: ${message}`,
    {
      retryable: true,
      cause: input.error,
    },
  );
};

const shouldRetryCryptocurrencyCvError = (
  error: CryptocurrencyCvRequestError,
  requestOptions: CryptocurrencyCvRequestOptions,
  attempt: number,
): boolean =>
  error.retryable && attempt < CRYPTOCURRENCY_CV_MAX_RETRIES && !requestOptions.signal?.aborted;

const getRetryDelayMs = (response: Response, attempt: number): number => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.round(retryAfterSeconds * 1_000);
    }

    const retryAfterDate = Date.parse(retryAfter);
    if (Number.isFinite(retryAfterDate)) {
      return Math.max(0, retryAfterDate - Date.now());
    }
  }

  return CRYPTOCURRENCY_CV_RETRY_BACKOFF_MS * (attempt + 1);
};

async function fetchCryptocurrencyCvJson(
  input: CryptocurrencyCvRequestInput,
  attempt = 0,
): Promise<CryptocurrencyCvJsonResponse> {
  const requestOptions = input.options ?? {};
  const requestUrl = buildRequestUrl(input);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `${CRYPTOCURRENCY_CV_API_BASE_URL}/`,
        "User-Agent": CRYPTOCURRENCY_CV_USER_AGENT,
      },
      signal: getRequestSignal(requestOptions),
    });

    const responseText = await response.text();

    if (!response.ok) {
      const snippet = extractErrorSnippet(responseText);
      const error = new CryptocurrencyCvRequestError(
        `Crypto News API request failed (${response.status} ${response.statusText}) for ${input.path}${snippet ? `: ${snippet}` : ""}`,
        {
          retryable: CRYPTOCURRENCY_CV_RETRYABLE_STATUS_CODES.has(response.status),
          status: response.status,
        },
      );
      if (shouldRetryCryptocurrencyCvError(error, requestOptions, attempt)) {
        await Bun.sleep(getRetryDelayMs(response, attempt));
        return fetchCryptocurrencyCvJson(input, attempt + 1);
      }
      throw error;
    }

    try {
      return {
        requestUrl,
        payload: JSON.parse(responseText),
      };
    } catch (error) {
      throw new CryptocurrencyCvRequestError(
        `Crypto News API returned invalid JSON for ${input.path}${extractErrorSnippet(responseText) ? `: ${extractErrorSnippet(responseText)}` : ""}`,
        {
          retryable: false,
          cause: error,
        },
      );
    }
  } catch (error) {
    const requestError = toCryptocurrencyCvRequestError({
      error,
      path: input.path,
      requestOptions,
    });
    if (shouldRetryCryptocurrencyCvError(requestError, requestOptions, attempt)) {
      await Bun.sleep(CRYPTOCURRENCY_CV_RETRY_BACKOFF_MS * (attempt + 1));
      return fetchCryptocurrencyCvJson(input, attempt + 1);
    }
    throw requestError;
  }
}

export const getCryptoNewsLatest = async (input: {
  page?: number;
  perPage?: number;
  lang?: string;
  category?: string;
  options?: CryptocurrencyCvRequestOptions;
} = {}): Promise<CryptocurrencyCvJsonResponse> =>
  fetchCryptocurrencyCvJson({
    path: "/api/news",
    query: {
      page: input.page,
      perPage: input.perPage,
      lang: input.lang,
      category: input.category,
    },
    options: input.options,
  });

export const searchCryptoNews = async (input: {
  query: string;
  page?: number;
  perPage?: number;
  lang?: string;
  options?: CryptocurrencyCvRequestOptions;
}): Promise<CryptocurrencyCvJsonResponse> =>
  fetchCryptocurrencyCvJson({
    path: "/api/search",
    query: {
      q: assertNonEmptyParam("query", input.query),
      page: input.page,
      perPage: input.perPage,
      lang: input.lang,
    },
    options: input.options,
  });

export const getCryptoAssetSentiment = async (input: {
  asset: string;
  options?: CryptocurrencyCvRequestOptions;
}): Promise<CryptocurrencyCvJsonResponse> =>
  fetchCryptocurrencyCvJson({
    path: "/api/ai/sentiment",
    query: {
      asset: assertNonEmptyParam("asset", input.asset),
    },
    options: input.options,
  });

export const getCryptoFearGreedIndex = async (input: {
  options?: CryptocurrencyCvRequestOptions;
} = {}): Promise<CryptocurrencyCvJsonResponse> =>
  fetchCryptocurrencyCvJson({
    path: "/api/market/fear-greed",
    options: input.options,
  });

export const getCryptoTrendingTopics = async (input: {
  options?: CryptocurrencyCvRequestOptions;
} = {}): Promise<CryptocurrencyCvJsonResponse> =>
  fetchCryptocurrencyCvJson({
    path: "/api/trending",
    options: input.options,
  });

export const isCryptocurrencyCvRetryableError = (error: unknown): boolean =>
  error instanceof CryptocurrencyCvRequestError ? error.retryable : false;
