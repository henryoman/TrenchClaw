import { afterEach, describe, expect, test } from "bun:test";

import { createActionContext } from "../../../../src/ai/runtime/types/context";
import { SqliteStateStore } from "../../../../src/runtime/storage/sqlite-state-store";
import { queryRuntimeStoreAction } from "../../../../src/solana/actions/data-fetch/runtime/queryRuntimeStore";

const dbPaths: string[] = [];

afterEach(() => {
  for (const dbPath of dbPaths.splice(0)) {
    const file = Bun.file(dbPath);
    void file.delete();
    void Bun.file(`${dbPath}-wal`).delete();
    void Bun.file(`${dbPath}-shm`).delete();
  }
});

describe("queryRuntimeStoreAction", () => {
  test("returns conversation and chat data through JSON request input", async () => {
    const dbPath = `/tmp/trenchclaw-query-runtime-${crypto.randomUUID()}.db`;
    dbPaths.push(dbPath);

    const store = new SqliteStateStore({
      path: dbPath,
      walMode: true,
      busyTimeoutMs: 500,
    });
    const now = Date.now();
    store.saveConversation({
      id: "conv-1",
      sessionId: "session-1",
      title: "Main",
      summary: "Quick summary",
      createdAt: now,
      updatedAt: now,
    });
    store.saveChatMessage({
      id: "msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "hello",
      createdAt: now,
    });

    const ctx = createActionContext({ actor: "agent", stateStore: store });
    const result = await queryRuntimeStoreAction.execute(ctx, {
      request: {
        type: "listChatMessages",
        conversationId: "conv-1",
        limit: 20,
      },
    });

    expect(result.ok).toBe(true);
    const payload = result.data as { requestType: string; result: Array<{ content: string }> };
    expect(payload.requestType).toBe("listChatMessages");
    expect(payload.result[0]?.content).toBe("hello");

    store.close();
  });

  test("fails clearly when stateStore is missing from action context", async () => {
    const result = await queryRuntimeStoreAction.execute(createActionContext({ actor: "agent" }), {
      request: {
        type: "listConversations",
        limit: 10,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("STATE_STORE_UNAVAILABLE");
  });
});
