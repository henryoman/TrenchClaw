import type {
  RuntimeApiAiModelOptionView,
  RuntimeApiAiProviderOptionView,
  RuntimeApiAiSettingsResponse,
  RuntimeApiUpdateAiSettingsRequest,
  RuntimeApiUpdateAiSettingsResponse,
} from "@trenchclaw/types";
import { listAiModelCatalog, listAiProviderOptions } from "../../../ai/llm/modelCatalog";
import { ensureAiSettingsFileExists, loadAiSettings, normalizeAiSettingsInput, writeAiSettings } from "../../../ai/llm/aiSettingsFile";
import type { RuntimeTransportContext } from "../contracts";

const AI_MODEL_OPTIONS: RuntimeApiAiModelOptionView[] = listAiModelCatalog().map((entry) => ({
  id: entry.id,
  label: entry.label,
  providers: [...entry.providers],
}));

const AI_PROVIDER_OPTIONS: RuntimeApiAiProviderOptionView[] = listAiProviderOptions().map((entry) => ({
  id: entry.id,
  label: entry.label,
  description: entry.description,
}));

export const getAiSettings = async (): Promise<RuntimeApiAiSettingsResponse> => {
  const payload = await loadAiSettings();
  return {
    filePath: payload.filePath,
    settings: payload.settings,
    providerOptions: AI_PROVIDER_OPTIONS,
    options: AI_MODEL_OPTIONS,
  };
};

export const updateAiSettings = async (
  context: RuntimeTransportContext,
  payload: RuntimeApiUpdateAiSettingsRequest,
): Promise<RuntimeApiUpdateAiSettingsResponse> => {
  await ensureAiSettingsFileExists();
  const result = await writeAiSettings(normalizeAiSettingsInput(payload.settings));
  context.addActivity(
    "runtime",
    `AI settings updated: ${result.settings.provider}/${result.settings.model} (${result.settings.defaultMode})`,
  );
  return {
    filePath: result.filePath,
    savedAt: new Date().toISOString(),
    settings: result.settings,
    providerOptions: AI_PROVIDER_OPTIONS,
    options: AI_MODEL_OPTIONS,
  };
};
