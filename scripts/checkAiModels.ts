#!/usr/bin/env bun

import { z } from "zod";
import { DEFAULT_LLM_MODEL } from "../apps/trenchclaw/src/ai/llm/aiSettingsFile";
import { listAiModelCatalog } from "../apps/trenchclaw/src/ai/llm/modelCatalog";

const response = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(30_000) });
if (!response.ok) {
  throw new Error(`OpenRouter model catalog request failed (${response.status}).`);
}
const catalog = z.object({
  data: z.array(z.object({
    id: z.string(),
    supported_parameters: z.array(z.string()),
    expiration_date: z.string().nullable().optional(),
    pricing: z.object({ prompt: z.string(), completion: z.string() }),
  })),
}).parse(await response.json());
const available = new Map(catalog.data.map((model) => [model.id, model]));
const configured = listAiModelCatalog().filter((model) => model.providers.includes("openrouter"));
if (!configured.some((model) => model.id === DEFAULT_LLM_MODEL)) {
  throw new Error(`Default model ${DEFAULT_LLM_MODEL} is missing from the shipped model catalog.`);
}
for (const entry of configured) {
  const model = available.get(entry.id);
  if (!model) {
    throw new Error(`Shipped model ${entry.id} is unavailable on OpenRouter.`);
  }
  if (!model.supported_parameters.includes("tools")) {
    throw new Error(`Shipped model ${entry.id} does not support tool calling.`);
  }
  if (model.expiration_date && Date.parse(model.expiration_date) <= Date.now()) {
    throw new Error(`Shipped model ${entry.id} has expired (${model.expiration_date}).`);
  }
  if (Number(model.pricing.prompt) !== 0 || Number(model.pricing.completion) !== 0) {
    throw new Error(`Shipped free model ${entry.id} no longer has zero token pricing.`);
  }
}
console.log(`Verified ${configured.length} shipped OpenRouter models: available, free, and tool-capable. Default: ${DEFAULT_LLM_MODEL}.`);
