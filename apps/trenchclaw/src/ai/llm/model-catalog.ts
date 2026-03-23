export type AiModelProvider = "gateway" | "openrouter";

export interface AiModelCatalogEntry {
  id: string;
  label: string;
  providers: readonly AiModelProvider[];
}

export interface AiProviderOptionEntry {
  id: AiModelProvider;
  label: string;
  description: string;
}

const BOTH_PROVIDERS = ["gateway", "openrouter"] as const satisfies readonly AiModelProvider[];
const OPENROUTER_ONLY = ["openrouter"] as const satisfies readonly AiModelProvider[];

export const AI_PROVIDER_OPTIONS = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Use your OpenRouter key and show OpenRouter-supported models.",
  },
  {
    id: "gateway",
    label: "Vercel AI Gateway",
    description: "Use your Vercel AI Gateway key and show Gateway-supported models.",
  },
] as const satisfies readonly AiProviderOptionEntry[];

export const AI_MODEL_CATALOG = [
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "openai/gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "moonshotai/kimi-k2.5",
    label: "Kimi K2.5",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT-OSS 120B Free",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "openrouter/hunter-alpha",
    label: "Hunter Alpha",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "liquid/lfm-2.5-1.2b-thinking:free",
    label: "LFM 2.5 1.2B Thinking Free",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "minimax/minimax-m2.5:free",
    label: "MiniMax M2.5 Free",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "minimax/minimax-m2.7",
    label: "MiniMax M2.7",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    label: "Nemotron 3 Nano 30B A3B Free",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B A12B Free",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "openrouter/free",
    label: "OpenRouter Free",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "qwen/qwen3.5-flash-02-23",
    label: "Qwen 3.5 Flash 02-23",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "stepfun/step-3.5-flash:free",
    label: "Step 3.5 Flash Free",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "xiaomi/mimo-v2-flash",
    label: "Mimo V2 Flash",
    providers: OPENROUTER_ONLY,
  },
] as const satisfies readonly AiModelCatalogEntry[];

export const listAiModelCatalog = (): readonly AiModelCatalogEntry[] => AI_MODEL_CATALOG;
export const listAiProviderOptions = (): readonly AiProviderOptionEntry[] => AI_PROVIDER_OPTIONS;

export const findAiModelCatalogEntry = (model: string): AiModelCatalogEntry | null =>
  AI_MODEL_CATALOG.find((entry) => entry.id === model) ?? null;

export const supportsAiModelProvider = (provider: AiModelProvider, model: string): boolean => {
  const entry = findAiModelCatalogEntry(model);
  return entry ? entry.providers.includes(provider) : true;
};
