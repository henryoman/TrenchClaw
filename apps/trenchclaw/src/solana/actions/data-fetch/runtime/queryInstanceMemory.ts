import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";
import type { StateStore } from "../../../../ai/contracts/types/state";
import { buildInstanceMemoryBundle, normalizeFactKey, resolveInstanceId } from "./instance-memory-shared";

const maxLimit = 200;

const getProfileRequestSchema = z.object({
  type: z.literal("getProfile"),
  instanceId: z.string().trim().min(1).max(64).optional(),
});

const getFactRequestSchema = z.object({
  type: z.literal("getFact"),
  instanceId: z.string().trim().min(1).max(64).optional(),
  key: z.string().trim().min(1).max(160),
  includeExpired: z.boolean().default(false),
});

const getFactsRequestSchema = z.object({
  type: z.literal("getFacts"),
  instanceId: z.string().trim().min(1).max(64).optional(),
  prefix: z.string().trim().min(1).max(160).optional(),
  includeExpired: z.boolean().default(false),
  limit: z.number().int().positive().max(maxLimit).default(100),
});

const getBundleRequestSchema = z.object({
  type: z.literal("getBundle"),
  instanceId: z.string().trim().min(1).max(64).optional(),
  prefix: z.string().trim().min(1).max(160).optional(),
  includeExpired: z.boolean().default(false),
  limit: z.number().int().positive().max(maxLimit).default(100),
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

export const queryInstanceMemoryRequestSchema = z.preprocess(
  parseJsonObject,
  z.discriminatedUnion("type", [
    getProfileRequestSchema,
    getFactRequestSchema,
    getFactsRequestSchema,
    getBundleRequestSchema,
  ]),
);

export const queryInstanceMemoryInputSchema = z.object({
  request: queryInstanceMemoryRequestSchema,
});

type QueryInstanceMemoryInput = z.output<typeof queryInstanceMemoryInputSchema>;

const asRuntimeStore = (value: unknown): StateStore | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as StateStore;
};

export const queryInstanceMemoryAction: Action<QueryInstanceMemoryInput, unknown> = {
  name: "queryInstanceMemory",
  category: "data-based",
  subcategory: "read-only",
  inputSchema: queryInstanceMemoryInputSchema,
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
      let data: unknown;

      if (request.type === "getProfile") {
        data = store.getInstanceProfile(instanceId);
      } else if (request.type === "getFact") {
        const key = normalizeFactKey(request.key);
        if (!key) {
          throw new Error("key must contain at least one valid path segment");
        }
        data = store.getInstanceFact({
          instanceId,
          factKey: key,
          includeExpired: request.includeExpired,
        });
      } else if (request.type === "getFacts") {
        const normalizedPrefix = request.prefix ? normalizeFactKey(request.prefix) : null;
        const keyPrefix = normalizedPrefix ?? undefined;
        if (request.prefix && !keyPrefix) {
          throw new Error("prefix must contain at least one valid path segment");
        }
        data = store.listInstanceFacts({
          instanceId,
          limit: request.limit,
          includeExpired: request.includeExpired,
          keyPrefix,
        });
      } else {
        const normalizedPrefix = request.prefix ? normalizeFactKey(request.prefix) : null;
        const keyPrefix = normalizedPrefix ?? undefined;
        if (request.prefix && !keyPrefix) {
          throw new Error("prefix must contain at least one valid path segment");
        }
        const profile = store.getInstanceProfile(instanceId);
        const facts = store.listInstanceFacts({
          instanceId,
          limit: request.limit,
          includeExpired: request.includeExpired,
          keyPrefix,
        });
        data = buildInstanceMemoryBundle({
          instanceId,
          profile,
          facts,
        });
      }

      return {
        ok: true,
        retryable: false,
        data: {
          requestType: request.type,
          instanceId,
          result: data,
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
        code: "QUERY_INSTANCE_MEMORY_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
