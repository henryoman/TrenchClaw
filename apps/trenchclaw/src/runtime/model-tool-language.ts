import { z } from "zod";

import { listKnowledgeDocsRequestSchema } from "../solana/actions/data-fetch/runtime/listKnowledgeDocs";
import { queryInstanceMemoryRequestSchema } from "../solana/actions/data-fetch/runtime/queryInstanceMemory";
import { queryRuntimeStoreRequestSchema } from "../solana/actions/data-fetch/runtime/queryRuntimeStore";

const machineContextValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

const machineContextSchema = {
  thought: machineContextValueSchema.optional(),
  notes: machineContextValueSchema.optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
};

const queryRuntimeStoreParamsSchema = queryRuntimeStoreRequestSchema;
const queryInstanceMemoryParamsSchema = queryInstanceMemoryRequestSchema;
const listKnowledgeDocsParamsSchema = listKnowledgeDocsRequestSchema.default({
  tier: "all",
  limit: 80,
});

export const MACHINE_TOOL_ENVELOPE_NOTE =
  "Machine call shape: send one JSON object with `params` for the real arguments. Optional `thought`, `notes`, or `meta` are allowed and ignored by runtime execution.";

const createMachineToolEnvelopeSchema = (paramsSchema: z.ZodTypeAny): z.ZodTypeAny =>
  z.object({
    params: paramsSchema,
    ...machineContextSchema,
  });

export const getModelToolParamsSchema = (toolName: string, baseSchema: z.ZodTypeAny): z.ZodTypeAny => {
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

export const getModelToolEnvelopeSchema = (toolName: string, baseSchema: z.ZodTypeAny): z.ZodTypeAny =>
  createMachineToolEnvelopeSchema(getModelToolParamsSchema(toolName, baseSchema));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const normalizeModelToolEnvelopeInput = (toolName: string, rawInput: unknown): unknown => {
  const envelope = isRecord(rawInput) ? rawInput : {};
  const params = envelope.params;

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

export const toModelToolExampleInput = (toolName: string, exampleInput: unknown): unknown => {
  if (toolName === "queryRuntimeStore" && isRecord(exampleInput) && "request" in exampleInput) {
    return { params: exampleInput.request };
  }
  if (toolName === "queryInstanceMemory" && isRecord(exampleInput) && "request" in exampleInput) {
    return { params: exampleInput.request };
  }
  if (toolName === "listKnowledgeDocs" && isRecord(exampleInput) && "request" in exampleInput) {
    return { params: exampleInput.request };
  }
  if (exampleInput === undefined) {
    return { params: {} };
  }
  return { params: exampleInput };
};
