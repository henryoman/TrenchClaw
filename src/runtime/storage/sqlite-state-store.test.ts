import { afterEach, describe, expect, test } from "bun:test";

import type { ActionResult } from "../../ai/contracts/action";
import { SqliteStateStore } from "./sqlite-state-store";

const dbPaths: string[] = [];

afterEach(() => {
  for (const dbPath of dbPaths.splice(0)) {
    const file = Bun.file(dbPath);
    void file.delete();
    void Bun.file(`${dbPath}-wal`).delete();
    void Bun.file(`${dbPath}-shm`).delete();
  }
});

describe("SqliteStateStore", () => {
  test("persists jobs and receipts", () => {
    const dbPath = `/tmp/trenchclaw-store-${crypto.randomUUID()}.db`;
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });

    const now = Date.now();
    store.saveJob({
      id: "job-1",
      botId: "bot-1",
      routineName: "createWallets",
      status: "pending",
      config: { count: 1 },
      cyclesCompleted: 0,
      createdAt: now,
      updatedAt: now,
    });

    const receipt: ActionResult = {
      ok: true,
      retryable: false,
      idempotencyKey: "idem-1",
      durationMs: 5,
      timestamp: now,
    };
    store.saveReceipt(receipt);

    expect(store.getJob("job-1")?.routineName).toBe("createWallets");
    expect(store.getReceipt("idem-1")?.ok).toBe(true);
    expect(store.getRecentReceipts(10).length).toBe(1);
    store.close();
  });
});

