import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";
import { buildKnowledgeLookup, resolveKnowledgeRoot } from "../../../../lib/knowledge/knowledge-index";
const maxLimit = 200;

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

export const listKnowledgeDocsRequestSchema = z.object({
  tier: z.enum(["all", "core", "deep", "support", "skills"]).default("all"),
  query: z.string().trim().min(1).max(160).optional(),
  limit: z.number().int().positive().max(maxLimit).default(80),
});

export const listKnowledgeDocsInputSchema = z.object({
  request: z.preprocess(parseJsonObject, listKnowledgeDocsRequestSchema).default({
    tier: "all",
    limit: 80,
  }),
});

type ListKnowledgeDocsInput = z.output<typeof listKnowledgeDocsInputSchema>;

const matchesTier = (
  tier: z.infer<typeof listKnowledgeDocsRequestSchema>["tier"],
  kind: Awaited<ReturnType<typeof buildKnowledgeLookup>>[number]["kind"],
): boolean => {
  if (tier === "all") {
    return true;
  }
  if (tier === "core") {
    return kind === "core-doc";
  }
  if (tier === "deep") {
    return kind === "deep-doc";
  }
  if (tier === "support") {
    return kind === "support-doc";
  }
  return kind === "skill-pack";
};

export const listKnowledgeDocsAction: Action<ListKnowledgeDocsInput, unknown> = {
  name: "listKnowledgeDocs",
  category: "data-based",
  subcategory: "read-only",
  inputSchema: listKnowledgeDocsInputSchema,
  async execute(_ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();
    try {
      const knowledgeRoot = resolveKnowledgeRoot();
      const { tier, query, limit } = input.request;
      const normalizedQuery = query?.trim().toLowerCase() ?? "";
      const docs = (await buildKnowledgeLookup(knowledgeRoot))
        .filter((entry) => matchesTier(tier, entry.kind))
        .filter((entry) => {
          if (!normalizedQuery) {
            return true;
          }
          const haystack = [
            entry.alias,
            ...entry.aliases,
            entry.title,
            entry.path,
            entry.readWhen,
            ...entry.topics,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        })
        .slice(0, limit)
        .map((entry) => ({
          alias: entry.alias,
          aliases: entry.aliases,
          kind: entry.kind,
          title: entry.title,
          path: entry.path,
          topics: entry.topics,
          readWhen: entry.readWhen,
          priority: entry.priority,
          authority: entry.authority,
          referenceCount: entry.referenceCount,
        }));

      return {
        ok: true,
        retryable: false,
        data: {
          result: docs,
          totalReturned: docs.length,
          request: {
            tier,
            query: query ?? null,
            limit,
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
        code: "LIST_KNOWLEDGE_DOCS_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
