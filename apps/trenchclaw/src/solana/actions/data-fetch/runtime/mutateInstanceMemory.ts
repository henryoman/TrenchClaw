import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import type { StateStore } from "../../../../ai/runtime/types/state";
import { normalizeFactKey, resolveInstanceId } from "./instance-memory-shared";

const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  summary: z.string().trim().min(1).max(2_000).optional(),
  tradingStyle: z.string().trim().min(1).max(120).optional(),
  riskTolerance: z.string().trim().min(1).max(120).optional(),
  preferredAssets: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  dislikedAssets: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateProfileRequestSchema = z.object({
  type: z.literal("updateProfile"),
  instanceId: z.string().trim().min(1).max(64).optional(),
  patch: profilePatchSchema,
});

const upsertFactRequestSchema = z.object({
  type: z.literal("upsertFact"),
  instanceId: z.string().trim().min(1).max(64).optional(),
  key: z.string().trim().min(1).max(160),
  value: z.unknown(),
  confidence: z.number().min(0).max(1).default(0.7),
  source: z.string().trim().min(1).max(120).default("instance-memory"),
  sourceMessageId: z.string().trim().min(1).max(120).optional(),
  expiresAt: z.number().int().nonnegative().optional(),
});

const parseJsonObject = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const mutateInstanceMemoryRequestSchema = z.preprocess(
  parseJsonObject,
  z.discriminatedUnion("type", [updateProfileRequestSchema, upsertFactRequestSchema]),
);

const mutateInstanceMemoryInputSchema = z.object({
  request: mutateInstanceMemoryRequestSchema,
});

type MutateInstanceMemoryInput = z.output<typeof mutateInstanceMemoryInputSchema>;

const asRuntimeStore = (value: unknown): StateStore | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as StateStore;
};

export const mutateInstanceMemoryAction: Action<MutateInstanceMemoryInput, unknown> = {
  name: "mutateInstanceMemory",
  category: "data-based",
  inputSchema: mutateInstanceMemoryInputSchema,
  async execute(ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();
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

    const request = input.request;
    const instanceId = resolveInstanceId(request.instanceId);
    if (!instanceId) {
      return {
        ok: false,
        retryable: false,
        error: "instanceId is required (request.instanceId or TRENCHCLAW_ACTIVE_INSTANCE_ID)",
        code: "INSTANCE_ID_REQUIRED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }

    try {
      const now = Date.now();

      if (request.type === "updateProfile") {
        const existing = store.getInstanceProfile(instanceId);
        const next = {
          instanceId,
          displayName: request.patch.displayName ?? existing?.displayName,
          summary: request.patch.summary ?? existing?.summary,
          tradingStyle: request.patch.tradingStyle ?? existing?.tradingStyle,
          riskTolerance: request.patch.riskTolerance ?? existing?.riskTolerance,
          preferredAssets: request.patch.preferredAssets ?? existing?.preferredAssets,
          dislikedAssets: request.patch.dislikedAssets ?? existing?.dislikedAssets,
          metadata: request.patch.metadata ?? existing?.metadata,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };

        store.saveInstanceProfile(next);

        return {
          ok: true,
          retryable: false,
          data: {
            requestType: request.type,
            instanceId,
            result: next,
          },
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }

      const key = normalizeFactKey(request.key);
      if (!key) {
        throw new Error("key must contain at least one valid path segment");
      }

      const existing = store.getInstanceFact({
        instanceId,
        factKey: key,
        includeExpired: true,
      });
      const recordId = existing?.id ?? `fact-${crypto.randomUUID()}`;
      store.saveInstanceFact({
        id: recordId,
        instanceId,
        factKey: key,
        factValue: request.value,
        confidence: request.confidence,
        source: request.source,
        sourceMessageId: request.sourceMessageId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        expiresAt: request.expiresAt,
      });

      return {
        ok: true,
        retryable: false,
        data: {
          requestType: request.type,
          instanceId,
          result: {
            id: recordId,
            key,
            updatedAt: now,
            expiresAt: request.expiresAt ?? null,
          },
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      return {
        ok: false,
        retryable: false,
        error: error instanceof Error ? error.message : String(error),
        code: "MUTATE_INSTANCE_MEMORY_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
