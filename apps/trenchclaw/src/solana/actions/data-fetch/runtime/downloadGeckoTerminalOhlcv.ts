import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { Action } from "../../../../ai/contracts/types/action";
import { ensureInstanceLayout } from "../../../../runtime/instance/layout";
import { resolveRequiredActiveInstanceIdSync } from "../../../../runtime/instance/state";
import { resolveInstanceWorkspaceGeckoTerminalOhlcvRoot } from "../../../../runtime/instance/workspace";
import { toRuntimeContractRelativePath } from "../../../../runtime/runtime-paths";
import {
  getGeckoTerminalPoolOhlcv,
  isGeckoTerminalRetryableError,
  type JsonObject,
  type JsonValue,
} from "../api/geckoterminal";

const timeframeSchema = z.enum(["minute", "hour", "day"]);

const aggregateSchema = z.number().int().positive().optional();

const downloadGeckoTerminalOhlcvInputSchema = z.object({
  poolAddress: z.string().trim().min(1),
  timeframe: timeframeSchema,
  aggregate: aggregateSchema,
  beforeTimestamp: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  currency: z.enum(["usd", "token"]).optional(),
  includeEmptyIntervals: z.boolean().default(false),
  token: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  const allowedAggregatesByTimeframe: Record<z.infer<typeof timeframeSchema>, readonly number[]> = {
    minute: [1, 5, 15],
    hour: [1, 4, 12],
    day: [1],
  };

  if (typeof value.aggregate === "number" && !allowedAggregatesByTimeframe[value.timeframe].includes(value.aggregate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["aggregate"],
      message: `Invalid aggregate for ${value.timeframe}. Allowed values: ${allowedAggregatesByTimeframe[value.timeframe].join(", ")}`,
    });
  }
});

type DownloadGeckoTerminalOhlcvInput = z.output<typeof downloadGeckoTerminalOhlcvInputSchema>;

interface DownloadGeckoTerminalOhlcvOutput {
  instanceId: string;
  network: "solana";
  source: "geckoterminal";
  requestUrl: string;
  downloadedAt: string;
  candleCount: number;
  latestOpenTimestamp: number | null;
  earliestOpenTimestamp: number | null;
  outputPath: string;
  runtimePath: string;
}

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);

const asNumericTimestamp = (value: JsonValue | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const getOhlcvRows = (payload: JsonObject): JsonValue[] => {
  const dataNode = isJsonObject(payload.data) ? payload.data : null;
  const attributesNode = dataNode && isJsonObject(dataNode.attributes) ? dataNode.attributes : null;
  return Array.isArray(attributesNode?.ohlcv_list) ? attributesNode.ohlcv_list : [];
};

const sanitizePathSegment = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "segment";

const createArtifactFileName = (input: DownloadGeckoTerminalOhlcvInput, downloadedAtIso: string): string => {
  const timestampSegment = downloadedAtIso.replace(/[:.]/gu, "-");
  const aggregateSegment = typeof input.aggregate === "number" ? `agg-${input.aggregate}` : "agg-default";
  return `${sanitizePathSegment(input.poolAddress)}-${input.timeframe}-${aggregateSegment}-${timestampSegment}.json`;
};

export const downloadGeckoTerminalOhlcvAction: Action<
  DownloadGeckoTerminalOhlcvInput,
  DownloadGeckoTerminalOhlcvOutput
> = {
  name: "downloadGeckoTerminalOhlcv",
  category: "data-based",
  inputSchema: downloadGeckoTerminalOhlcvInputSchema,
  async execute(_ctx, rawInput) {
    const startedAt = Date.now();
    const idempotencyKey = crypto.randomUUID();

    try {
      const input = downloadGeckoTerminalOhlcvInputSchema.parse(rawInput);
      const activeInstanceId = resolveRequiredActiveInstanceIdSync(
        "No active instance selected. GeckoTerminal OHLC downloads are instance-scoped.",
      );
      await ensureInstanceLayout(activeInstanceId);

      const { payload, requestUrl } = await getGeckoTerminalPoolOhlcv({
        poolAddress: input.poolAddress,
        timeframe: input.timeframe,
        aggregate: input.aggregate,
        beforeTimestamp: input.beforeTimestamp,
        limit: input.limit,
        currency: input.currency,
        includeEmptyIntervals: input.includeEmptyIntervals,
        token: input.token,
      });

      const downloadedAt = new Date().toISOString();
      const outputDirectory = resolveInstanceWorkspaceGeckoTerminalOhlcvRoot(activeInstanceId);
      const outputPath = path.join(outputDirectory, createArtifactFileName(input, downloadedAt));
      const ohlcvRows = getOhlcvRows(payload);
      const latestRow = Array.isArray(ohlcvRows[0]) ? ohlcvRows[0] : null;
      const earliestRowCandidate = ohlcvRows.at(-1);
      const earliestRow = Array.isArray(earliestRowCandidate) ? earliestRowCandidate : null;
      const latestOpenTimestamp = latestRow ? asNumericTimestamp(latestRow[0]) : null;
      const earliestOpenTimestamp = earliestRow ? asNumericTimestamp(earliestRow[0]) : null;

      const artifactDocument = {
        artifactType: "geckoterminal-ohlcv-download",
        source: "geckoterminal",
        network: "solana",
        downloadedAt,
        request: {
          poolAddress: input.poolAddress,
          timeframe: input.timeframe,
          aggregate: input.aggregate ?? null,
          beforeTimestamp: input.beforeTimestamp ?? null,
          limit: input.limit,
          currency: input.currency ?? null,
          includeEmptyIntervals: input.includeEmptyIntervals,
          token: input.token ?? null,
        },
        requestUrl,
        response: payload,
      };

      await mkdir(outputDirectory, { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(artifactDocument, null, 2)}\n`, "utf8");

      return {
        ok: true,
        retryable: false,
        data: {
          instanceId: activeInstanceId,
          network: "solana",
          source: "geckoterminal",
          requestUrl,
          downloadedAt,
          candleCount: ohlcvRows.length,
          latestOpenTimestamp,
          earliestOpenTimestamp,
          outputPath,
          runtimePath: toRuntimeContractRelativePath(outputPath),
        },
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    } catch (error) {
      const retryable = isGeckoTerminalRetryableError(error);
      return {
        ok: false,
        retryable,
        error: error instanceof Error ? error.message : String(error),
        code: retryable ? "GECKOTERMINAL_OHLC_DOWNLOAD_RETRYABLE" : "GECKOTERMINAL_OHLC_DOWNLOAD_FAILED",
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        idempotencyKey,
      };
    }
  },
};
