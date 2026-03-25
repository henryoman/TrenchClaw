const createChatStreamTimeoutError = (timeoutMs: number): Error =>
  new Error(`Chat request timed out after ${timeoutMs}ms`);

type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;

const combineAbortSignals = (signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined => {
  const activeSignals = signals.filter((signal): signal is AbortSignal => signal != null);
  if (activeSignals.length === 0) {
    return undefined;
  }
  if (activeSignals.length === 1) {
    return activeSignals[0];
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(activeSignals);
  }

  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
    for (const signal of activeSignals) {
      signal.removeEventListener("abort", abort);
    }
  };
  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
};

export const createTimedStreamingFetch = (
  timeoutMs: number,
  baseFetch: FetchLike = globalThis.fetch,
): FetchLike =>
  async (input, init) => {
    const timeoutController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    const clearTimeoutGuard = (): void => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const armTimeoutGuard = (): void => {
      clearTimeoutGuard();
      timeoutId = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
      }, timeoutMs);
    };

    const requestSignal = combineAbortSignals([init?.signal, timeoutController.signal]);
    armTimeoutGuard();

    try {
      const response = await baseFetch(input, {
        ...init,
        signal: requestSignal,
      });

      if (!response.body) {
        clearTimeoutGuard();
        return response;
      }

      const reader = response.body.getReader();
      const monitoredBody = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            while (true) {
              // Stream readers must be consumed sequentially.
              // eslint-disable-next-line no-await-in-loop
              const { done, value } = await reader.read();
              if (done) {
                clearTimeoutGuard();
                controller.close();
                return;
              }
              armTimeoutGuard();
              controller.enqueue(value);
            }
          } catch (error) {
            clearTimeoutGuard();
            if (timedOut) {
              controller.error(createChatStreamTimeoutError(timeoutMs));
              return;
            }
            controller.error(error);
          }
        },
        async cancel(reason) {
          clearTimeoutGuard();
          await reader.cancel(reason);
        },
      });

      return new Response(monitoredBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      clearTimeoutGuard();
      if (timedOut || (error instanceof Error && error.name === "AbortError" && timeoutController.signal.aborted)) {
        throw createChatStreamTimeoutError(timeoutMs);
      }
      throw error;
    }
  };
