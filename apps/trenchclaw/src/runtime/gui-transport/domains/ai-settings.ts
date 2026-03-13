import { mkdir } from "node:fs/promises";
import type {
  GuiAiModelOptionView,
  GuiAiProviderOptionView,
  GuiAiSettingsResponse,
  GuiUpdateAiSettingsRequest,
  GuiUpdateAiSettingsResponse,
} from "@trenchclaw/types";
import { listAiModelCatalog, listAiProviderOptions } from "../../../ai/llm/model-catalog";
import { ensureAiSettingsFileExists, loadAiSettings, normalizeAiSettingsInput, writeAiSettings } from "../../../ai/llm/ai-settings-file";
import { assertProtectedNoReadWritePath } from "../../security/write-scope";
import { AI_SETTINGS_FILE_PATH, NO_READ_DIRECTORY } from "../constants";
import type { RuntimeGuiDomainContext } from "../contracts";

const AI_MODEL_OPTIONS: GuiAiModelOptionView[] = listAiModelCatalog().map((entry) => ({
  id: entry.id,
  label: entry.label,
  providers: [...entry.providers],
}));

const AI_PROVIDER_OPTIONS: GuiAiProviderOptionView[] = listAiProviderOptions().map((entry) => ({
  id: entry.id,
  label: entry.label,
  description: entry.description,
}));

export const getAiSettings = async (): Promise<GuiAiSettingsResponse> => {
  assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize AI settings directory");
  await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
  const payload = await loadAiSettings();
  return {
    filePath: payload.filePath,
    templatePath: payload.templatePath,
    initializedFromTemplate: payload.initializedFromTemplate,
    settings: payload.settings,
    providerOptions: AI_PROVIDER_OPTIONS,
    options: AI_MODEL_OPTIONS,
  };
};

export const updateAiSettings = async (
  context: RuntimeGuiDomainContext,
  payload: GuiUpdateAiSettingsRequest,
): Promise<GuiUpdateAiSettingsResponse> => {
  assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize AI settings directory");
  await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
  await ensureAiSettingsFileExists();
  assertProtectedNoReadWritePath(AI_SETTINGS_FILE_PATH, "write AI settings file");
  const result = await writeAiSettings(normalizeAiSettingsInput(payload.settings));
  context.addActivity("runtime", `AI settings updated: ${result.settings.provider}/${result.settings.model}`);
  return {
    filePath: result.filePath,
    savedAt: new Date().toISOString(),
    settings: result.settings,
    providerOptions: AI_PROVIDER_OPTIONS,
    options: AI_MODEL_OPTIONS,
  };
};
