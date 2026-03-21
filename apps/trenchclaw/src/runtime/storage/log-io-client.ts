import {
  type LogIoOperation,
  type LogIoRequest,
  type LogIoRequestWithoutId,
  type LogIoResponse,
  performLogIoWrite,
} from "./log-io-core";

export interface LogIoWriteEvent {
  ok: boolean;
  operation: LogIoOperation;
  filePath: string;
  bytes: number;
  error?: string;
}

export type LogIoWriteObserver = (event: LogIoWriteEvent) => void;

let writeObserver: LogIoWriteObserver | null = null;

export const setLogIoWriteObserver = (observer: LogIoWriteObserver | null): void => {
  writeObserver = observer;
};

export class LogIoClient {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();

  constructor() {
    if (process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER === "1") {
      return;
    }

    try {
      this.worker = new Worker(new URL("./log-io-write.worker.ts", import.meta.url).href, { type: "module" });
    } catch {
      this.worker = null;
      return;
    }

    this.worker.addEventListener("message", (event: MessageEvent<LogIoResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      this.pending.delete(response.id);
      const operation = response.operation;
      const filePath = response.filePath;
      const bytes = response.bytes;
      if (operation && filePath && typeof bytes === "number") {
        writeObserver?.({
          ok: response.ok,
          operation,
          filePath,
          bytes,
          ...(response.error ? { error: response.error } : {}),
        });
      }
      if (response.ok) {
        pending.resolve();
        return;
      }
      pending.reject(new Error(response.error ?? "log io worker failed"));
    });
    this.worker.addEventListener("error", () => {
      this.worker?.terminate();
      this.worker = null;
    });
  }

  isWorkerEnabled(): boolean {
    return this.worker !== null;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }

  private async performDirectWrite(request: LogIoRequestWithoutId): Promise<void> {
    const result = await performLogIoWrite(request);
    writeObserver?.({
      ok: true,
      operation: result.operation,
      filePath: result.filePath,
      bytes: result.bytes,
    });
  }

  request(request: LogIoRequestWithoutId): Promise<void> {
    if (process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER === "1" || !this.worker) {
      return this.performDirectWrite(request);
    }

    const id = crypto.randomUUID();
    const withId: LogIoRequest = { ...request, id };
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker?.postMessage(withId);
      } catch {
        this.pending.delete(id);
        void this.performDirectWrite(request).then(resolve, reject);
      }
    });
  }

  appendUtf8(filePath: string, content: string): Promise<void> {
    return this.request({
      type: "appendUtf8",
      filePath,
      content,
    });
  }

  writeUtf8(filePath: string, content: string): Promise<void> {
    return this.request({
      type: "writeUtf8",
      filePath,
      content,
    });
  }
}

let sharedClient: LogIoClient | null = null;

export const getLogIoClient = (): LogIoClient => {
  if (process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER === "1" && sharedClient?.isWorkerEnabled()) {
    sharedClient.dispose();
    sharedClient = null;
  }
  sharedClient ??= new LogIoClient();
  return sharedClient;
};
