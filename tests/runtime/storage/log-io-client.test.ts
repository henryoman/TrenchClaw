import { afterEach, describe, expect, test } from "bun:test";

const initialDisableWorker = process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER;
const initialWorker = globalThis.Worker;

afterEach(() => {
  if (initialDisableWorker === undefined) {
    delete process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER;
  } else {
    process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER = initialDisableWorker;
  }

  globalThis.Worker = initialWorker;
});

describe("getLogIoClient", () => {
  test("recreates the shared client when worker usage is disabled after initialization", async () => {
    class FakeWorker {
      terminated = false;

      addEventListener(): void {}

      postMessage(): void {}

      terminate(): void {
        this.terminated = true;
      }
    }

    const createdWorkers: FakeWorker[] = [];
    globalThis.Worker = class extends FakeWorker {
      constructor(..._args: unknown[]) {
        super();
        createdWorkers.push(this);
      }
    } as unknown as typeof Worker;

    delete process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER;

    const moduleUrl = new URL("../../../apps/trenchclaw/src/runtime/storage/log-io-client.ts", import.meta.url).href;
    const { getLogIoClient } = await import(`${moduleUrl}?test=${crypto.randomUUID()}`);

    const workerClient = getLogIoClient();
    expect(workerClient.isWorkerEnabled()).toBe(true);
    expect(createdWorkers).toHaveLength(1);

    process.env.TRENCHCLAW_DISABLE_LOG_IO_WORKER = "1";

    const directClient = getLogIoClient();
    expect(directClient).not.toBe(workerClient);
    expect(createdWorkers[0]?.terminated).toBe(true);
    expect(directClient.isWorkerEnabled()).toBe(false);
  });
});
