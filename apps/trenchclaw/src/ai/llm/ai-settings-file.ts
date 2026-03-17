import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { RUNTIME_STATE_ROOT } from "../../runtime/runtime-paths";
import type { AiModelProvider } from "./model-catalog";
import { parseStructuredFile, resolvePathFromModule, resolvePreferredPath } from "./shared";

export const DEFAULT_LLM_MODEL = "anthropic/claude-sonnet-4.6";
export const DEFAULT_LLM_PROVIDER: AiModelProvider = "openrouter";

const DEFAULT_AI_SETTINGS_TEMPLATE_FILE = "../config/ai.template.json";
const AI_SETTINGS_FILE_ENV = "TRENCHCLAW_AI_SETTINGS_FILE";
const AI_SETTINGS_TEMPLATE_FILE_ENV = "TRENCHCLAW_AI_SETTINGS_TEMPLATE_FILE";

export const aiSettingsSchema = z.object({
  provider: z.enum(["gateway", "openrouter"]).default(DEFAULT_LLM_PROVIDER),
  model: z.string().trim().min(1).default(DEFAULT_LLM_MODEL),
  defaultMode: z.string().trim().min(1).default("primary"),
  temperature: z.number().min(0).max(2).nullable().default(null),
  maxOutputTokens: z.number().int().positive().max(64_000).nullable().default(null),
});

export type AiSettings = z.output<typeof aiSettingsSchema>;
export type AiSettingsInput = z.input<typeof aiSettingsSchema>;

export const normalizeAiSettingsInput = (input: AiSettingsInput): AiSettings => aiSettingsSchema.parse(input);

export const DEFAULT_AI_SETTINGS: AiSettings = normalizeAiSettingsInput({});

const DEFAULT_AI_SETTINGS_FILE = path.join(RUNTIME_STATE_ROOT, "runtime", "ai.json");
const LEGACY_AI_SETTINGS_FILE = path.join(RUNTIME_STATE_ROOT, "user", "ai.json");

export const resolveAiSettingsPaths = async (): Promise<{ filePath: string; templatePath: string }> => ({
  filePath: await resolvePreferredPath({
    preferredPath: DEFAULT_AI_SETTINGS_FILE,
    envValues: [process.env[AI_SETTINGS_FILE_ENV]],
    legacyPaths: [LEGACY_AI_SETTINGS_FILE],
  }),
  templatePath: resolvePathFromModule(
    import.meta.url,
    DEFAULT_AI_SETTINGS_TEMPLATE_FILE,
    process.env[AI_SETTINGS_TEMPLATE_FILE_ENV],
  ),
});

const parseAiSettingsValue = (value: unknown): AiSettings => {
  const direct = aiSettingsSchema.safeParse(value);
  if (direct.success) {
    return normalizeAiSettingsInput(direct.data);
  }

  return normalizeAiSettingsInput({});
};

export const ensureAiSettingsFileExists = async (): Promise<{ initializedFromTemplate: boolean; filePath: string; templatePath: string }> => {
  const { filePath, templatePath } = await resolveAiSettingsPaths();
  const targetPath = path.resolve(filePath);

  try {
    const existing = await stat(targetPath);
    if (!existing.isFile()) {
      throw new Error(`AI settings path exists but is not a file: "${targetPath}"`);
    }
    return { initializedFromTemplate: false, filePath: targetPath, templatePath: path.resolve(templatePath) };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });

  let content = `${JSON.stringify(DEFAULT_AI_SETTINGS, null, 2)}\n`;
  try {
    content = await readFile(path.resolve(templatePath), "utf8");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const parsed = parseAiSettingsValue(JSON.parse(content));
  await writeFile(targetPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(targetPath, 0o600);
  } catch {
    // Best-effort only.
  }

  return { initializedFromTemplate: true, filePath: targetPath, templatePath: path.resolve(templatePath) };
};

export const loadAiSettings = async (): Promise<{ filePath: string; templatePath: string; initializedFromTemplate: boolean; settings: AiSettings }> => {
  const ensured = await ensureAiSettingsFileExists();
  const raw = await parseStructuredFile(ensured.filePath);
  return {
    ...ensured,
    settings: parseAiSettingsValue(raw),
  };
};

export const writeAiSettings = async (input: AiSettingsInput): Promise<{ filePath: string; settings: AiSettings }> => {
  const { filePath } = await resolveAiSettingsPaths();
  const targetPath = path.resolve(filePath);
  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const settings = normalizeAiSettingsInput(input);
  await writeFile(targetPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(targetPath, 0o600);
  } catch {
    // Best-effort only.
  }
  return { filePath: targetPath, settings };
};
