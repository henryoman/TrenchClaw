import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseStructuredFile, resolvePathFromModule } from "./shared";

export const LLM_PROVIDERS = ["openai", "openrouter", "openai-compatible"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const defaultModelByProvider: Record<LlmProvider, string> = {
  openai: "gpt-4.1-mini",
  openrouter: "stepfun/step-3.5-flash:free",
  "openai-compatible": "gpt-4.1-mini",
};

const DEFAULT_AI_SETTINGS_FILE = "../../../.runtime-state/user/ai.json";
const DEFAULT_AI_SETTINGS_TEMPLATE_FILE = "../config/ai.template.json";
const AI_SETTINGS_FILE_ENV = "TRENCHCLAW_AI_SETTINGS_FILE";
const AI_SETTINGS_TEMPLATE_FILE_ENV = "TRENCHCLAW_AI_SETTINGS_TEMPLATE_FILE";

export const aiSettingsSchema = z.object({
  provider: z.enum(LLM_PROVIDERS).default("openrouter"),
  model: z.string().trim().min(1).default(defaultModelByProvider.openrouter),
  baseURL: z.string().trim().default("https://openrouter.ai/api/v1"),
  defaultMode: z.string().trim().min(1).default("primary"),
  temperature: z.number().min(0).max(2).nullable().default(null),
  maxOutputTokens: z.number().int().positive().max(64_000).nullable().default(null),
});

export type AiSettings = z.output<typeof aiSettingsSchema>;
export type AiSettingsInput = z.input<typeof aiSettingsSchema>;

const legacyAiSettingsSchema = z.object({
  trenchClawDefaultModel: z
    .object({
      provider: z.enum(LLM_PROVIDERS).optional(),
      model: z.string().trim().min(1).optional(),
      baseURL: z.string().trim().optional(),
    })
    .optional(),
});

export const DEFAULT_AI_SETTINGS: AiSettings = aiSettingsSchema.parse({});

export const resolveAiSettingsPaths = (): { filePath: string; templatePath: string } => ({
  filePath: resolvePathFromModule(import.meta.url, DEFAULT_AI_SETTINGS_FILE, process.env[AI_SETTINGS_FILE_ENV]),
  templatePath: resolvePathFromModule(
    import.meta.url,
    DEFAULT_AI_SETTINGS_TEMPLATE_FILE,
    process.env[AI_SETTINGS_TEMPLATE_FILE_ENV],
  ),
});

const normalizeLegacyAiSettings = (value: unknown): AiSettings | null => {
  const parsed = legacyAiSettingsSchema.safeParse(value);
  if (!parsed.success || !parsed.data.trenchClawDefaultModel) {
    return null;
  }

  const legacy = parsed.data.trenchClawDefaultModel;
  const provider = legacy.provider ?? DEFAULT_AI_SETTINGS.provider;
  return aiSettingsSchema.parse({
    provider,
    model: legacy.model ?? defaultModelByProvider[provider],
    baseURL: legacy.baseURL ?? (provider === "openrouter" ? "https://openrouter.ai/api/v1" : ""),
  });
};

const parseAiSettingsValue = (value: unknown): AiSettings => {
  const direct = aiSettingsSchema.safeParse(value);
  if (direct.success) {
    return direct.data;
  }

  const legacy = normalizeLegacyAiSettings(value);
  if (legacy) {
    return legacy;
  }

  return aiSettingsSchema.parse({});
};

export const ensureAiSettingsFileExists = async (): Promise<{ initializedFromTemplate: boolean; filePath: string; templatePath: string }> => {
  const { filePath, templatePath } = resolveAiSettingsPaths();
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
  const { filePath } = resolveAiSettingsPaths();
  const targetPath = path.resolve(filePath);
  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const settings = aiSettingsSchema.parse(input);
  await writeFile(targetPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(targetPath, 0o600);
  } catch {
    // Best-effort only.
  }
  return { filePath: targetPath, settings };
};
