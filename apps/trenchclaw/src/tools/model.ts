import { z } from "zod";

import { listKnowledgeDocsRequestSchema } from "./knowledge/listKnowledgeDocs";
import { queryInstanceMemoryRequestSchema } from "./core/queryInstanceMemory";
import { queryRuntimeStoreRequestSchema } from "./core/queryRuntimeStore";

const queryRuntimeStoreParamsSchema = queryRuntimeStoreRequestSchema;
const queryInstanceMemoryParamsSchema = queryInstanceMemoryRequestSchema;
const listKnowledgeDocsParamsSchema = listKnowledgeDocsRequestSchema.default({
  tier: "all",
  limit: 80,
});

export const getRuntimeToolModelInputSchema = (toolName: string, baseSchema: z.ZodTypeAny): z.ZodTypeAny => {
  if (toolName === "queryRuntimeStore") {
    return queryRuntimeStoreParamsSchema;
  }
  if (toolName === "queryInstanceMemory") {
    return queryInstanceMemoryParamsSchema;
  }
  if (toolName === "listKnowledgeDocs") {
    return listKnowledgeDocsParamsSchema;
  }
  return baseSchema;
};

export const getModelToolEnvelopeSchema = getRuntimeToolModelInputSchema;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const unwrapLegacyParamsEnvelope = (rawInput: unknown): unknown =>
  isRecord(rawInput) && "params" in rawInput ? rawInput.params : rawInput;

export const normalizeRuntimeToolModelInput = (toolName: string, rawInput: unknown): unknown => {
  const params = unwrapLegacyParamsEnvelope(rawInput);

  if (toolName === "queryRuntimeStore") {
    return { request: params };
  }
  if (toolName === "queryInstanceMemory") {
    return { request: params };
  }
  if (toolName === "listKnowledgeDocs") {
    return { request: params };
  }

  return params;
};

export const normalizeModelToolEnvelopeInput = normalizeRuntimeToolModelInput;

export const toRuntimeToolModelExampleInput = (toolName: string, exampleInput: unknown): unknown => {
  if (toolName === "queryRuntimeStore" && isRecord(exampleInput) && "request" in exampleInput) {
    return exampleInput.request;
  }
  if (toolName === "queryInstanceMemory" && isRecord(exampleInput) && "request" in exampleInput) {
    return exampleInput.request;
  }
  if (toolName === "listKnowledgeDocs" && isRecord(exampleInput) && "request" in exampleInput) {
    return exampleInput.request;
  }
  return exampleInput;
};

export const toModelToolExampleInput = toRuntimeToolModelExampleInput;
