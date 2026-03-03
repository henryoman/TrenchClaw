type AppendUtf8Request = {
  id: string;
  type: "appendUtf8";
  filePath: string;
  content: string;
};

type WriteUtf8Request = {
  id: string;
  type: "writeUtf8";
  filePath: string;
  content: string;
};

type LogIoRequest = AppendUtf8Request | WriteUtf8Request;

type LogIoResponse = {
  id: string;
  ok: boolean;
  error?: string;
  operation?: "appendUtf8" | "writeUtf8";
  filePath?: string;
  bytes?: number;
};

export interface LogIoWriteEvent {
  ok: boolean;
  operation: "appendUtf8" | "writeUtf8";
  filePath: string;
  bytes: number;
  error?: string;
}

export type LogIoWriteObserver = (event: LogIoWriteEvent) => void;

let writeObserver: LogIoWriteObserver | null = null;

export const setLogIoWriteObserver = (observer: LogIoWriteObserver | null): void => {
  writeObserver = observer;
};

export class LogIoWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL("./log-io.worker.ts", import.meta.url).href, { type: "module" });
    this.worker.onmessage = (event: MessageEvent<LogIoResponse>) => {
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
    };
  }

  request(request: Omit<LogIoRequest, "id">): Promise<void> {
    const id = crypto.randomUUID();
    const withId: LogIoRequest = { ...request, id };
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(withId);
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

let sharedClient: LogIoWorkerClient | null = null;

export const getLogIoWorkerClient = (): LogIoWorkerClient => {
  sharedClient ??= new LogIoWorkerClient();
  return sharedClient;
};
