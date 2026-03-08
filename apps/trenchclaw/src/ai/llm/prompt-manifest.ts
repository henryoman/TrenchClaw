import { isRecord } from "./shared";

export interface PromptPayloadManifestDefaults {
  mode?: string;
  includeKnowledgeManifest?: boolean;
  includeKnowledgeDirectoryTreeFallback?: boolean;
  includeWorkspaceDirectoryTree?: boolean;
}

export type PromptGeneratedSectionSource =
  | "knowledgeManifest"
  | "knowledgeDirectoryTree"
  | "workspaceDirectoryTree"
  | "resolvedUserSettings"
  | "runtimeCapabilityAppendix"
  | "filesystemPolicy";

export interface PromptFileSectionConfig {
  kind: "file";
  title?: string;
  path: string;
}

export interface PromptGeneratedSectionConfig {
  kind: "generated";
  title?: string;
  source: PromptGeneratedSectionSource;
  fallbackSource?: Extract<PromptGeneratedSectionSource, "knowledgeDirectoryTree">;
}

export type PromptSectionConfig = PromptFileSectionConfig | PromptGeneratedSectionConfig;

export interface PromptModeConfig {
  title?: string;
  promptFiles: string[];
  sections: PromptSectionConfig[];
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

    const promptFiles = Array.isArray(config.promptFiles) ? config.promptFiles.filter((value): value is string => typeof value === "string") : [];
    const rawSections = config.sections;
    const parsedSections: PromptSectionConfig[] = [];

    if (rawSections !== undefined) {
      if (!Array.isArray(rawSections) || rawSections.length === 0) {
        throw new Error(`Prompt manifest "${filePath}" mode "${modeName}" sections must be a non-empty array`);
      }

      for (const [index, rawSection] of rawSections.entries()) {
        if (!isRecord(rawSection)) {
          throw new Error(`Prompt manifest "${filePath}" mode "${modeName}" section ${index + 1} must be an object`);
        }

        const kind = rawSection.kind;
        if (kind === "file") {
          if (typeof rawSection.path !== "string" || rawSection.path.trim().length === 0) {
            throw new Error(
              `Prompt manifest "${filePath}" mode "${modeName}" section ${index + 1} must define a non-empty file path`,
            );
          }
          parsedSections.push({
            kind,
            title: typeof rawSection.title === "string" ? rawSection.title : undefined,
            path: rawSection.path,
          });
          continue;
        }

        if (kind === "generated") {
          const generatedSource = rawSection.source;
          if (
            generatedSource !== "knowledgeManifest" &&
            generatedSource !== "knowledgeDirectoryTree" &&
            generatedSource !== "workspaceDirectoryTree" &&
            generatedSource !== "resolvedUserSettings" &&
            generatedSource !== "runtimeCapabilityAppendix" &&
            generatedSource !== "filesystemPolicy"
          ) {
            throw new Error(
              `Prompt manifest "${filePath}" mode "${modeName}" section ${index + 1} has invalid generated source`,
            );
          }
          const fallbackSource =
            rawSection.fallbackSource === "knowledgeDirectoryTree" ? rawSection.fallbackSource : undefined;
          parsedSections.push({
            kind,
            title: typeof rawSection.title === "string" ? rawSection.title : undefined,
            source: generatedSource,
            fallbackSource,
          });
          continue;
        }

        throw new Error(`Prompt manifest "${filePath}" mode "${modeName}" section ${index + 1} has invalid kind`);
      }
    }

    if (parsedSections.length === 0) {
      if (promptFiles.length === 0) {
        throw new Error(
          `Prompt manifest "${filePath}" mode "${modeName}" must define either non-empty sections or promptFiles`,
        );
      }
      parsedSections.push(...promptFiles.map((promptFilePath) => ({ kind: "file" as const, path: promptFilePath })));
    }

    parsedModes[modeName] = {
      title: typeof config.title === "string" ? config.title : undefined,
      promptFiles,
      sections: parsedSections,
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
