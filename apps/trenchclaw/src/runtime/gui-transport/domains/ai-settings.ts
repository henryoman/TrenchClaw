import { mkdir } from "node:fs/promises";
import type {
  GuiAiSettingsResponse,
  GuiUpdateAiSettingsRequest,
  GuiUpdateAiSettingsResponse,
} from "@trenchclaw/types";
import { aiSettingsSchema, ensureAiSettingsFileExists, loadAiSettings, writeAiSettings } from "../../../ai/llm/ai-settings-file";
import { assertProtectedNoReadWritePath } from "../../security/write-scope";
import { AI_SETTINGS_FILE_PATH, NO_READ_DIRECTORY } from "../constants";
import type { RuntimeGuiDomainContext } from "../contracts";

export const getAiSettings = async (): Promise<GuiAiSettingsResponse> => {
  assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize AI settings directory");
  await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
  const payload = await loadAiSettings();
  return {
    filePath: payload.filePath,
    templatePath: payload.templatePath,
    initializedFromTemplate: payload.initializedFromTemplate,
    settings: payload.settings,
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
  const result = await writeAiSettings(aiSettingsSchema.parse(payload.settings));
  context.addActivity("runtime", `AI settings updated: ${result.settings.provider} / ${result.settings.model}`);
  return {
    filePath: result.filePath,
    savedAt: new Date().toISOString(),
    settings: result.settings,
  };
};
