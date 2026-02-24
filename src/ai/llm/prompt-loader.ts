import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderDirectoryTree } from "../brain/knowledge/knowledge-tree";
import { renderWorkspaceMapSection } from "./workspace-map";
import { renderResolvedUserSettingsSection } from "./user-settings-loader";

const DEFAULT_PROMPT_MANIFEST_FILE = "../brain/system-settings/system/prompts/payload-manifest.yaml";
const DEFAULT_KNOWLEDGE_DIR = "../brain/knowledge/";
const DEFAULT_KNOWLEDGE_MANIFEST_FILE = "../brain/knowledge/KNOWLEDGE_MANIFEST.md";
const DEFAULT_WORKSPACE_DIR = "../../";

const FALLBACK_SYSTEM_PROMPT = [
  "You are TrenchClaw, a safety-first Solana runtime operator.",
  "Prioritize policy compliance, capital protection, and clear operator communication.",
].join(" ");

const PROMPT_MANIFEST_PATH_ENV = "TRENCHCLAW_PROMPT_MANIFEST_FILE";
const AGENT_MODE_ENV = "TRENCHCLAW_AGENT_MODE";
const KNOWLEDGE_DIR_ENV = "TRENCHCLAW_KNOWLEDGE_DIR";
const KNOWLEDGE_MANIFEST_PATH_ENV = "TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE";
const WORKSPACE_DIR_ENV = "TRENCHCLAW_WORKSPACE_DIR";

interface PromptPayloadManifestDefaults {
  mode?: string;
  includeKnowledgeManifest?: boolean;
  includeKnowledgeDirectoryTreeFallback?: boolean;
  includeWorkspaceDirectoryTree?: boolean;
}

interface PromptModeConfig {
  promptFiles: string[];
  includeKnowledgeManifest?: boolean;
  includeKnowledgeDirectoryTreeFallback?: boolean;
  includeWorkspaceDirectoryTree?: boolean;
}

interface PromptPayloadManifest {
  version: number;
  defaults?: PromptPayloadManifestDefaults;
  modes: Record<string, PromptModeConfig>;
}

export interface SystemPromptPayload {
  mode: string;
  systemPrompt: string;
  promptFiles: string[];
}

let cachedManifest: PromptPayloadManifest | null = null;
let cachedManifestPath: string | null = null;
const cachedPromptByMode = new Map<string, SystemPromptPayload>();

const resolvePath = (relativePath: string, envValue?: string): string => {
  if (envValue && envValue.trim().length > 0) {
    return envValue.trim();
  }

  return fileURLToPath(new URL(relativePath, import.meta.url));
};

const injectKnowledgeDirectoryTree = async (basePrompt: string): Promise<string> => {
  const knowledgeDir = resolvePath(DEFAULT_KNOWLEDGE_DIR, process.env[KNOWLEDGE_DIR_ENV]);

  try {
    const tree = await renderDirectoryTree(knowledgeDir);
    return `${basePrompt}

## Available Knowledge Directory Tree
Use this tree to decide what knowledge files exist before asking to read them.
\`\`\`text
${tree}
\`\`\``;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `${basePrompt}

## Available Knowledge Directory Tree
Knowledge tree could not be generated from "${knowledgeDir}": ${detail}`;
  }
};

const injectKnowledgeManifest = async (
  basePrompt: string,
  includeFallbackTree: boolean,
): Promise<string> => {
  const manifestPath = resolvePath(
    DEFAULT_KNOWLEDGE_MANIFEST_FILE,
    process.env[KNOWLEDGE_MANIFEST_PATH_ENV],
  );

  try {
    const manifestFile = Bun.file(manifestPath);
    if (await manifestFile.exists()) {
      const manifestText = (await manifestFile.text()).trim();
      if (manifestText.length > 0) {
        return `${basePrompt}

## Available Knowledge Manifest
${manifestText}`;
      }
    }
  } catch {
    // Fall through to runtime tree generation.
  }

  if (!includeFallbackTree) {
    return basePrompt;
  }

  return injectKnowledgeDirectoryTree(basePrompt);
};

const injectWorkspaceDirectoryTree = async (basePrompt: string): Promise<string> => {
  const workspaceDir = resolvePath(DEFAULT_WORKSPACE_DIR, process.env[WORKSPACE_DIR_ENV]);

  try {
    const workspaceSection = await renderWorkspaceMapSection(workspaceDir);
    return `${basePrompt}

${workspaceSection}`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `${basePrompt}

## Workspace Map (src/)
Workspace map could not be generated from "${workspaceDir}": ${detail}`;
  }
};

const injectResolvedUserSettings = async (basePrompt: string): Promise<string> => {
  const section = await renderResolvedUserSettingsSection();
  return `${basePrompt}

${section}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const parsePromptManifest = (source: string, filePath: string): PromptPayloadManifest => {
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse prompt manifest "${filePath}": ${detail}`);
  }

  if (!isRecord(raw)) {
    throw new Error(`Prompt manifest "${filePath}" must be an object`);
  }

  const version = raw.version;
  if (version !== 1) {
    throw new Error(`Prompt manifest "${filePath}" must define version: 1`);
  }

  const defaults = raw.defaults;
  if (defaults !== undefined && !isRecord(defaults)) {
    throw new Error(`Prompt manifest "${filePath}" has invalid defaults`);
  }

  const modes = raw.modes;
  if (!isRecord(modes) || Object.keys(modes).length === 0) {
    throw new Error(`Prompt manifest "${filePath}" must define at least one mode`);
  }

  const parsedModes: Record<string, PromptModeConfig> = {};
  for (const [modeName, config] of Object.entries(modes)) {
    if (!isRecord(config)) {
      throw new Error(`Prompt manifest "${filePath}" mode "${modeName}" must be an object`);
    }

    const promptFiles = config.promptFiles;
    if (!Array.isArray(promptFiles) || promptFiles.length === 0 || !promptFiles.every((v) => typeof v === "string")) {
      throw new Error(
        `Prompt manifest "${filePath}" mode "${modeName}" must define a non-empty string[] promptFiles`,
      );
    }

    parsedModes[modeName] = {
      promptFiles,
      includeKnowledgeManifest:
        typeof config.includeKnowledgeManifest === "boolean"
          ? config.includeKnowledgeManifest
          : undefined,
      includeKnowledgeDirectoryTreeFallback:
        typeof config.includeKnowledgeDirectoryTreeFallback === "boolean"
          ? config.includeKnowledgeDirectoryTreeFallback
          : undefined,
      includeWorkspaceDirectoryTree:
        typeof config.includeWorkspaceDirectoryTree === "boolean"
          ? config.includeWorkspaceDirectoryTree
          : undefined,
    };
  }

  return {
    version,
    defaults:
      defaults && isRecord(defaults)
        ? {
            mode: typeof defaults.mode === "string" ? defaults.mode : undefined,
            includeKnowledgeManifest:
              typeof defaults.includeKnowledgeManifest === "boolean"
                ? defaults.includeKnowledgeManifest
                : undefined,
            includeKnowledgeDirectoryTreeFallback:
              typeof defaults.includeKnowledgeDirectoryTreeFallback === "boolean"
                ? defaults.includeKnowledgeDirectoryTreeFallback
                : undefined,
            includeWorkspaceDirectoryTree:
              typeof defaults.includeWorkspaceDirectoryTree === "boolean"
                ? defaults.includeWorkspaceDirectoryTree
                : undefined,
          }
        : undefined,
    modes: parsedModes,
  };
};

const loadPromptManifest = async (): Promise<{
  manifest: PromptPayloadManifest | null;
  manifestPath: string;
}> => {
  const manifestPath = resolvePath(DEFAULT_PROMPT_MANIFEST_FILE, process.env[PROMPT_MANIFEST_PATH_ENV]);
  if (cachedManifest && cachedManifestPath === manifestPath) {
    return { manifest: cachedManifest, manifestPath };
  }

  const file = Bun.file(manifestPath);
  if (!(await file.exists())) {
    cachedManifest = null;
    cachedManifestPath = manifestPath;
    cachedPromptByMode.clear();
    return { manifest: null, manifestPath };
  }

  const parsed = parsePromptManifest((await file.text()).trim(), manifestPath);
  cachedManifest = parsed;
  cachedManifestPath = manifestPath;
  cachedPromptByMode.clear();
  return { manifest: parsed, manifestPath };
};

const resolveModeConfig = (
  manifest: PromptPayloadManifest,
  requestedMode: string | undefined,
): { mode: string; modeConfig: PromptModeConfig } => {
  const configuredDefaultMode = manifest.defaults?.mode;
  const fallbackDefaultMode = Object.keys(manifest.modes)[0];
  if (!fallbackDefaultMode) {
    throw new Error("Prompt manifest must define at least one mode");
  }
  const defaultMode = configuredDefaultMode && manifest.modes[configuredDefaultMode]
    ? configuredDefaultMode
    : fallbackDefaultMode;

  const activeMode: string = requestedMode?.trim().length ? requestedMode.trim() : defaultMode;
  const modeConfig = manifest.modes[activeMode];
  if (modeConfig) {
    return { mode: activeMode, modeConfig };
  }

  throw new Error(
    `Unknown agent mode "${activeMode}". Available modes: ${Object.keys(manifest.modes).join(", ")}`,
  );
};

const resolvePromptFilePath = (manifestPath: string, filePath: string): string => {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.resolve(path.dirname(manifestPath), filePath);
};

const loadPromptFileText = async (manifestPath: string, promptFilePath: string): Promise<string> => {
  const resolvedPath = resolvePromptFilePath(manifestPath, promptFilePath);
  const file = Bun.file(resolvedPath);
  if (!(await file.exists())) {
    throw new Error(`Prompt file does not exist: "${resolvedPath}"`);
  }
  return (await file.text()).trim();
};

export const loadSystemPromptPayload = async (mode = process.env[AGENT_MODE_ENV]): Promise<SystemPromptPayload> => {
  const { manifest, manifestPath } = await loadPromptManifest();
  const cacheKey = mode?.trim().length ? mode.trim() : "__default__";

  if (cachedPromptByMode.has(cacheKey)) {
    return cachedPromptByMode.get(cacheKey)!;
  }

  if (!manifest) {
    const fallbackPrompt = await injectKnowledgeManifest(FALLBACK_SYSTEM_PROMPT, true);
    const payload: SystemPromptPayload = {
      mode: "fallback",
      systemPrompt: fallbackPrompt,
      promptFiles: [],
    };
    cachedPromptByMode.set(cacheKey, payload);
    return payload;
  }

  const { mode: resolvedMode, modeConfig } = resolveModeConfig(manifest, mode);
  const includeKnowledgeManifest = modeConfig.includeKnowledgeManifest ?? manifest.defaults?.includeKnowledgeManifest ?? true;
  const includeKnowledgeDirectoryTreeFallback =
    modeConfig.includeKnowledgeDirectoryTreeFallback ??
    manifest.defaults?.includeKnowledgeDirectoryTreeFallback ??
    true;
  const includeWorkspaceDirectoryTree =
    modeConfig.includeWorkspaceDirectoryTree ?? manifest.defaults?.includeWorkspaceDirectoryTree ?? false;

  const fileTexts = await Promise.all(modeConfig.promptFiles.map((filePath) => loadPromptFileText(manifestPath, filePath)));
  const basePrompt = fileTexts.map((text) => text.trim()).filter((text) => text.length > 0).join("\n\n");
  const withKnowledge = includeKnowledgeManifest
    ? await injectKnowledgeManifest(basePrompt || FALLBACK_SYSTEM_PROMPT, includeKnowledgeDirectoryTreeFallback)
    : basePrompt || FALLBACK_SYSTEM_PROMPT;
  const withWorkspaceTree = includeWorkspaceDirectoryTree
    ? await injectWorkspaceDirectoryTree(withKnowledge)
    : withKnowledge;
  const withUserSettings = await injectResolvedUserSettings(withWorkspaceTree);

  const payload: SystemPromptPayload = {
    mode: resolvedMode,
    systemPrompt: withUserSettings,
    promptFiles: modeConfig.promptFiles.map((filePath) => resolvePromptFilePath(manifestPath, filePath)),
  };
  cachedPromptByMode.set(cacheKey, payload);
  return payload;
};

export const loadDefaultSystemPrompt = async (): Promise<string> => {
  const payload = await loadSystemPromptPayload(process.env[AGENT_MODE_ENV]);
  return payload.systemPrompt;
};

export const resetPromptLoaderCache = (): void => {
  cachedManifest = null;
  cachedManifestPath = null;
  cachedPromptByMode.clear();
};
