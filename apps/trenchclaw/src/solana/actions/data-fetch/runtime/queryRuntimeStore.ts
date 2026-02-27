import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import type { StateStore } from "../../../../ai/runtime/types/state";

const maxLimit = 200;

const listConversationsRequestSchema = z.object({
  type: z.literal("listConversations"),
  limit: z.number().int().positive().max(maxLimit).default(50),
});

const getConversationRequestSchema = z.object({
  type: z.literal("getConversation"),
  conversationId: z.string().trim().min(1),
});

const listChatMessagesRequestSchema = z.object({
  type: z.literal("listChatMessages"),
  conversationId: z.string().trim().min(1),
  limit: z.number().int().positive().max(maxLimit).default(100),
});

const listJobsRequestSchema = z.object({
  type: z.literal("listJobs"),
  status: z.enum(["pending", "running", "paused", "stopped", "failed"]).optional(),
  botId: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(maxLimit).default(50),
});

const getRecentReceiptsRequestSchema = z.object({
  type: z.literal("getRecentReceipts"),
  limit: z.number().int().positive().max(maxLimit).default(50),
});

const searchRuntimeTextRequestSchema = z.object({
  type: z.literal("searchRuntimeText"),
  query: z.string().trim().min(1).max(200),
  scope: z.enum(["all", "conversations", "messages", "jobs", "receipts"]).default("all"),
  limit: z.number().int().positive().max(maxLimit).default(25),
  messageScanLimit: z.number().int().positive().max(maxLimit).default(100),
});

const getRuntimeKnowledgeSurfaceRequestSchema = z.object({
  type: z.literal("getRuntimeKnowledgeSurface"),
  recentConversationsLimit: z.number().int().positive().max(maxLimit).default(20),
  recentJobsLimit: z.number().int().positive().max(maxLimit).default(20),
  recentReceiptsLimit: z.number().int().positive().max(maxLimit).default(20),
});

const queryRuntimeStoreInputSchema = z.object({
  request: z.discriminatedUnion("type", [
    listConversationsRequestSchema,
    getConversationRequestSchema,
    listChatMessagesRequestSchema,
    listJobsRequestSchema,
    getRecentReceiptsRequestSchema,
    searchRuntimeTextRequestSchema,
    getRuntimeKnowledgeSurfaceRequestSchema,
  ]),
});

type QueryRuntimeStoreInput = z.output<typeof queryRuntimeStoreInputSchema>;

const asRuntimeStore = (value: unknown): StateStore | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as StateStore;
};

export const queryRuntimeStoreAction: Action<QueryRuntimeStoreInput, unknown> = {
  name: "queryRuntimeStore",
  category: "data-based",
  subcategory: "read-only",
  inputSchema: queryRuntimeStoreInputSchema,
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

    try {
      const request = input.request;
      let data: unknown;

      if (request.type === "listConversations") {
        data = store.listConversations(request.limit);
      } else if (request.type === "getConversation") {
        data = store.getConversation(request.conversationId);
      } else if (request.type === "listChatMessages") {
        data = store.listChatMessages(request.conversationId, request.limit);
      } else if (request.type === "listJobs") {
        data = store.listJobs({
          status: request.status,
          botId: request.botId,
        }).slice(0, request.limit);
      } else if (request.type === "searchRuntimeText") {
        data = store.searchRuntimeText({
          query: request.query,
          scope: request.scope,
          limit: request.limit,
          messageScanLimit: request.messageScanLimit,
        });
      } else if (request.type === "getRuntimeKnowledgeSurface") {
        data = store.getRuntimeKnowledgeSurface({
          recentConversationsLimit: request.recentConversationsLimit,
          recentJobsLimit: request.recentJobsLimit,
          recentReceiptsLimit: request.recentReceiptsLimit,
        });
      } else {
        data = store.getRecentReceipts(request.limit);
      }

      return {
        ok: true,
        retryable: false,
        data: {
          requestType: request.type,
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
        code: "QUERY_RUNTIME_STORE_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
