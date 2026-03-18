import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import { createFactId, createIdempotencyKey } from "../../../../ai/runtime/types/ids";
import type { StateStore } from "../../../../ai/runtime/types/state";
import { normalizeFactKey, resolveInstanceId } from "./instance-memory-shared";

const upsertInstanceFactInputSchema = z.object({
  instanceId: z.string().trim().min(1).max(64).optional(),
  factKey: z.string().trim().min(1).max(120),
  factValue: z.unknown(),
  confidence: z.number().min(0).max(1).default(0.7),
  source: z.string().trim().min(1).max(120).default("runtime-chat"),
  sourceMessageId: z.string().trim().min(1).max(120).optional(),
  expiresAt: z.number().int().nonnegative().optional(),
});

type UpsertInstanceFactInput = z.output<typeof upsertInstanceFactInputSchema>;

const asRuntimeStore = (value: unknown): StateStore | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as StateStore;
};

/** @deprecated Use mutateInstanceMemoryAction with request.type="upsertFact". */
export const upsertInstanceFactAction: Action<UpsertInstanceFactInput, unknown> = {
  name: "upsertInstanceFact",
  category: "data-based",
  inputSchema: upsertInstanceFactInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = createIdempotencyKey();
    const store = asRuntimeStore(ctx.stateStore);
    if (!store) {
      return {
        ok: false,
        retryable: false,
        error: "stateStore is not available in action context",
        code: "STATE_STORE_UNAVAILABLE",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }

    const instanceId = resolveInstanceId(input.instanceId);
    if (!instanceId) {
      return {
        ok: false,
        retryable: false,
        error: "instanceId is required (input.instanceId or TRENCHCLAW_ACTIVE_INSTANCE_ID)",
        code: "INSTANCE_ID_REQUIRED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }

    const now = Date.now();
    const factKey = normalizeFactKey(input.factKey);
    if (!factKey) {
      return {
        ok: false,
        retryable: false,
        error: "factKey must contain at least one valid path segment",
        code: "INVALID_FACT_KEY",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
    const existing = store.getInstanceFact({
      instanceId,
      factKey,
      includeExpired: true,
    });
    const recordId = existing?.id ?? createFactId();

    store.saveInstanceFact({
      id: recordId,
      instanceId,
      factKey,
      factValue: input.factValue,
      confidence: input.confidence,
      source: input.source,
      sourceMessageId: input.sourceMessageId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      expiresAt: input.expiresAt,
    });

    return {
      ok: true,
      retryable: false,
      data: {
        id: recordId,
        instanceId,
        factKey,
        confidence: input.confidence,
        updatedAt: now,
        expiresAt: input.expiresAt ?? null,
      },
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
      idempotencyKey,
    };
  },
};
