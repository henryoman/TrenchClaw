export type AiModelProvider = "gateway" | "openrouter";
export type AiProviderPreference = "auto" | AiModelProvider;

export interface AiModelCatalogEntry {
  id: string;
  label: string;
  providers: readonly AiModelProvider[];
}

export interface AiProviderOptionEntry {
  id: AiProviderPreference;
  label: string;
  description: string;
}

const BOTH_PROVIDERS = ["gateway", "openrouter"] as const satisfies readonly AiModelProvider[];
const OPENROUTER_ONLY = ["openrouter"] as const satisfies readonly AiModelProvider[];

export const AI_PROVIDER_OPTIONS = [
  {
    id: "auto",
    label: "Auto",
    description: "Use the first configured provider that supports the selected model. Gateway is preferred, then OpenRouter.",
  },
  {
    id: "gateway",
    label: "Vercel AI Gateway",
    description: "Pin requests to your Vercel AI Gateway key and only show Gateway-supported models.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Pin requests to your OpenRouter key and only show OpenRouter-supported models.",
  },
] as const satisfies readonly AiProviderOptionEntry[];

export const AI_MODEL_CATALOG = [
  {
    id: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "anthropic/claude-opus-4.6",
    label: "Claude Opus 4.6",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "google/gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite Preview",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "x-ai/grok-4.20-beta",
    label: "Grok 4.20 Beta",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "qwen/qwen3.5-flash-02-23",
    label: "Qwen 3.5 Flash 02-23",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "qwen/qwen3.5-122b-a10b",
    label: "Qwen 3.5 122B A10B",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "moonshotai/kimi-k2.5",
    label: "Kimi K2.5",
    providers: BOTH_PROVIDERS,
  },
  {
    id: "openrouter/hunter-alpha",
    label: "Hunter Alpha",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "openrouter/free",
    label: "OpenRouter Free",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "stepfun/step-3.5-flash:free",
    label: "Step 3.5 Flash Free",
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
