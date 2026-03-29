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
    id: "stepfun/step-3.5-flash:free",
    label: "Step 3.5 Flash Free",
    providers: OPENROUTER_ONLY,
  },
  {
    id: "minimax/minimax-m2.5:free",
    label: "MiniMax M2.5 Free",
    providers: OPENROUTER_ONLY,
  },
] as const satisfies readonly AiModelCatalogEntry[];

export const listAiModelCatalog = (): readonly AiModelCatalogEntry[] => AI_MODEL_CATALOG;
export const listAiProviderOptions = (): readonly AiProviderOptionEntry[] => AI_PROVIDER_OPTIONS;

export const findAiModelCatalogEntry = (model: string): AiModelCatalogEntry | null =>
  AI_MODEL_CATALOG.find((entry) => entry.id === model) ?? null;

export const supportsAiModelProvider = (provider: AiModelProvider, model: string): boolean => {
  const entry = findAiModelCatalogEntry(model);
  return entry ? entry.providers.includes(provider) : false;
};
