import { afterEach, describe, expect, test } from "bun:test";

import type { ActionResult } from "../../../src/ai/contracts/action";
import { SqliteStateStore } from "../../../src/runtime/storage/sqlite-state-store";

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

    const prune = store.pruneRuntimeData({
      receiptsDays: 1,
      policyHitsDays: 1,
      decisionLogsDays: 1,
    });
    expect(prune.receiptsDeleted).toBe(0);

    store.close();
  });

  test("stores and reads OHLCV chart bars", () => {
    const dbPath = `/tmp/trenchclaw-market-${crypto.randomUUID()}.db`;
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });

    const baseTime = 1_770_000_000_000;
    const writes = store.saveOhlcvBars({
      instrument: {
        chain: "solana",
        address: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
      },
      source: "dexscreener",
      interval: "1m",
      bars: [
        {
          openTime: baseTime,
          closeTime: baseTime + 59_999,
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1234.56,
          trades: 120,
          raw: { pair: "SOL/USDC" },
        },
      ],
    });

    expect(writes).toBe(1);

    const bars = store.getOhlcvBars({
      instrument: {
        chain: "solana",
        address: "So11111111111111111111111111111111111111112",
      },
      source: "dexscreener",
      interval: "1m",
      limit: 10,
    });

    expect(bars.length).toBe(1);
    expect(bars[0]?.close).toBe(100.5);
    expect((bars[0]?.raw as { pair?: string } | undefined)?.pair).toBe("SOL/USDC");

    store.close();
  });
});
