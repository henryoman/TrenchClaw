import { isRecord } from "./shared";

export interface PromptPayloadManifestDefaults {
  mode?: string;
  includeKnowledgeManifest?: boolean;
  includeKnowledgeDirectoryTreeFallback?: boolean;
  includeWorkspaceDirectoryTree?: boolean;
}

export interface PromptModeConfig {
  promptFiles: string[];
  includeKnowledgeManifest?: boolean;
  includeKnowledgeDirectoryTreeFallback?: boolean;
  includeWorkspaceDirectoryTree?: boolean;
}

export interface PromptPayloadManifest {
  version: number;
  defaults?: PromptPayloadManifestDefaults;
  modes: Record<string, PromptModeConfig>;
}

export const parsePromptManifest = (source: string, filePath: string): PromptPayloadManifest => {
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse prompt manifest "${filePath}": ${detail}`, {
      cause: error,
    });
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
    if (
      !Array.isArray(promptFiles) ||
      promptFiles.length === 0 ||
      !promptFiles.every((value) => typeof value === "string")
    ) {
      throw new Error(
        `Prompt manifest "${filePath}" mode "${modeName}" must define a non-empty string[] promptFiles`,
      );
    }

    parsedModes[modeName] = {
      promptFiles,
      includeKnowledgeManifest:
        typeof config.includeKnowledgeManifest === "boolean" ? config.includeKnowledgeManifest : undefined,
      includeKnowledgeDirectoryTreeFallback:
        typeof config.includeKnowledgeDirectoryTreeFallback === "boolean"
          ? config.includeKnowledgeDirectoryTreeFallback
          : undefined,
      includeWorkspaceDirectoryTree:
        typeof config.includeWorkspaceDirectoryTree === "boolean" ? config.includeWorkspaceDirectoryTree : undefined,
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

export const resolvePromptModeConfig = (
  manifest: PromptPayloadManifest,
  requestedMode: string | undefined,
): { mode: string; modeConfig: PromptModeConfig } => {
  const configuredDefaultMode = manifest.defaults?.mode;
  const fallbackDefaultMode = Object.keys(manifest.modes)[0];
  if (!fallbackDefaultMode) {
    throw new Error("Prompt manifest must define at least one mode");
  }

  const defaultMode =
    configuredDefaultMode && manifest.modes[configuredDefaultMode] ? configuredDefaultMode : fallbackDefaultMode;
  const activeMode = requestedMode?.trim().length ? requestedMode.trim() : defaultMode;
  const modeConfig = manifest.modes[activeMode];
  if (modeConfig) {
    return { mode: activeMode, modeConfig };
  }

  throw new Error(
    `Unknown agent mode "${activeMode}". Available modes: ${Object.keys(manifest.modes).join(", ")}`,
  );
};
