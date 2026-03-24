import path from "node:path";
import { z } from "zod";
import { resolveRequiredActiveInstanceIdSync } from "../../runtime/instance/state";
import { resolveInstanceAiSettingsPath } from "../../runtime/instance/paths";
import { resolveRuntimeSeedInstancePath } from "../../runtime/runtime-paths";
import { assertInstanceSystemWritePath } from "../../runtime/security/write-scope";
import { ensureSeededJsonDocument, writeJsonDocument } from "../../runtime/settings/instance/io";
import type { AiModelProvider } from "./model-catalog";
import { parseStructuredFile } from "./shared";

export const DEFAULT_LLM_MODEL = "stepfun/step-3.5-flash:free";
export const DEFAULT_LLM_PROVIDER: AiModelProvider = "openrouter";

const AI_SETTINGS_FILE_ENV = "TRENCHCLAW_AI_SETTINGS_FILE";
const AI_SETTINGS_TEMPLATE_FILE_ENV = "TRENCHCLAW_AI_SETTINGS_TEMPLATE_FILE";
const NO_ACTIVE_INSTANCE_AI_SETTINGS_MESSAGE =
  "No active instance selected. AI settings are instance-scoped. Sign in before accessing AI settings.";

export const aiSettingsSchema = z.object({
  provider: z.enum(["gateway", "openrouter"]).default(DEFAULT_LLM_PROVIDER),
  model: z.string().trim().optional().default(DEFAULT_LLM_MODEL),
  defaultMode: z.string().trim().min(1).default("primary"),
  temperature: z.number().min(0).max(2).nullable().default(null),
  maxOutputTokens: z.number().int().positive().max(64_000).nullable().default(null),
}).transform((settings) => ({
  ...settings,
  model: DEFAULT_LLM_MODEL,
}));

export type AiSettings = z.output<typeof aiSettingsSchema>;
export type AiSettingsInput = z.input<typeof aiSettingsSchema>;

export const normalizeAiSettingsInput = (input: AiSettingsInput): AiSettings => aiSettingsSchema.parse(input);

const resolveAiSettingsFilePath = (): string => {
  const configuredPath = process.env[AI_SETTINGS_FILE_ENV]?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  return resolveInstanceAiSettingsPath(resolveRequiredActiveInstanceIdSync(NO_ACTIVE_INSTANCE_AI_SETTINGS_MESSAGE));
};

export const resolveAiSettingsPaths = async (input?: {
  filePath?: string;
  seedPath?: string;
}): Promise<{
  filePath: string;
  seedPath: string;
}> => ({
  filePath: path.resolve(input?.filePath ?? resolveAiSettingsFilePath()),
  seedPath: path.resolve(
    input?.seedPath
      ?? process.env[AI_SETTINGS_TEMPLATE_FILE_ENV]
      ?? resolveRuntimeSeedInstancePath("settings", "ai.json"),
  ),
});

const parseAiSettingsValue = (value: unknown): AiSettings => {
  const direct = aiSettingsSchema.safeParse(value);
  if (direct.success) {
    return direct.data;
  }

  return normalizeAiSettingsInput({});
};

const assertAiSettingsWritePath = (targetPath: string): void => {
  if (process.env[AI_SETTINGS_FILE_ENV]?.trim()) {
    return;
  }
  assertInstanceSystemWritePath(targetPath, "initialize AI settings file");
};

export const ensureAiSettingsFileExists = async (input?: {
  filePath?: string;
  seedPath?: string;
}): Promise<{ created: boolean; filePath: string }> => {
  const { filePath, seedPath } = await resolveAiSettingsPaths(input);
  const ensured = await ensureSeededJsonDocument({
    filePath,
    seedPath,
    parseDocument: parseAiSettingsValue,
    assertWritePath: assertAiSettingsWritePath,
    missingSeedDescription: "Runtime seed is missing AI settings file",
  });
  return {
    created: ensured.created,
    filePath: ensured.filePath,
  };
};

export const loadAiSettings = async (): Promise<{ filePath: string; settings: AiSettings }> => {
  const ensured = await ensureAiSettingsFileExists();
  const raw = await parseStructuredFile(ensured.filePath);
  return {
    filePath: ensured.filePath,
    settings: parseAiSettingsValue(raw),
  };
};

export const writeAiSettings = async (input: AiSettingsInput): Promise<{ filePath: string; settings: AiSettings }> => {
  const { filePath } = await resolveAiSettingsPaths();
  const settings = normalizeAiSettingsInput(input);
  const savedPath = await writeJsonDocument({
    filePath: path.resolve(filePath),
    document: settings,
    assertWritePath: process.env[AI_SETTINGS_FILE_ENV]?.trim()
      ? undefined
      : (targetPath) => {
          assertInstanceSystemWritePath(targetPath, "write AI settings file");
        },
  });
  return { filePath: savedPath, settings };
};
