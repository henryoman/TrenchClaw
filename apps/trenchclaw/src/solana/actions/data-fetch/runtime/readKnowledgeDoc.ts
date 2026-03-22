import path from "node:path";
import { z } from "zod";

import type { Action } from "../../../../ai/runtime/types/action";
import { buildKnowledgeLookup, resolveKnowledgeLookupEntry, resolveKnowledgeRoot } from "../../../../lib/knowledge/knowledge-index";
const maxLines = 500;

const readKnowledgeDocInputSchema = z.object({
  doc: z.string().trim().min(1).max(200),
  offset: z.number().int().min(1).default(1),
  limit: z.number().int().positive().max(maxLines).default(220),
});

type ReadKnowledgeDocInput = z.output<typeof readKnowledgeDocInputSchema>;

const withLineNumbers = (lines: string[], startLine: number): string =>
  lines.map((line, index) => `${startLine + index}|${line}`).join("\n");

export const readKnowledgeDocAction: Action<ReadKnowledgeDocInput, unknown> = {
  name: "readKnowledgeDoc",
  category: "data-based",
  subcategory: "read-only",
  inputSchema: readKnowledgeDocInputSchema,
  async execute(_ctx, input) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();
    try {
      const knowledgeRoot = resolveKnowledgeRoot();
      const entry = await resolveKnowledgeLookupEntry(knowledgeRoot, input.doc);
      if (!entry) {
        const suggestions = (await buildKnowledgeLookup(knowledgeRoot))
          .filter((candidate) => {
            const haystack = [candidate.alias, ...candidate.aliases, candidate.title, candidate.path]
              .join(" ")
              .toLowerCase();
            return haystack.includes(input.doc.trim().toLowerCase());
          })
          .slice(0, 12)
          .map((candidate) => ({
            alias: candidate.alias,
            title: candidate.title,
            kind: candidate.kind,
          }));

        return {
          ok: false,
          retryable: false,
          error: `Unknown knowledge doc "${input.doc}". Use listKnowledgeDocs to browse aliases first.`,
          code: "KNOWLEDGE_DOC_NOT_FOUND",
          data: {
            suggestions,
          },
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }

      const absolutePath = path.resolve(knowledgeRoot, entry.path.replace(/^src\/ai\/brain\/knowledge\//u, ""));
      const file = Bun.file(absolutePath);
      if (!(await file.exists())) {
        return {
          ok: false,
          retryable: false,
          error: `Knowledge doc exists in index but file is missing: ${entry.path}`,
          code: "KNOWLEDGE_DOC_FILE_MISSING",
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }

      const text = await file.text();
      const allLines = text.split(/\r?\n/u);
      const startLine = input.offset;
      const startIndex = startLine - 1;
      const lines = allLines.slice(startIndex, startIndex + input.limit);

      return {
        ok: true,
        retryable: false,
        data: {
          doc: {
            alias: entry.alias,
            aliases: entry.aliases,
            title: entry.title,
            kind: entry.kind,
            path: entry.path,
            topics: entry.topics,
            readWhen: entry.readWhen,
          },
          content: withLineNumbers(lines, startLine),
          offset: startLine,
          limit: input.limit,
          totalLines: allLines.length,
          returnedLines: lines.length,
          hasMore: startIndex + lines.length < allLines.length,
          nextOffset: startIndex + lines.length < allLines.length ? startLine + lines.length : null,
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
        code: "READ_KNOWLEDGE_DOC_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
