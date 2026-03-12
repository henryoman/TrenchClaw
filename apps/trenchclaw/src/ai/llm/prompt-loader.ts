import path from "node:path";
import { renderDirectoryTree } from "../brain/knowledge/knowledge-tree";
import {
  parsePromptManifest,
  resolvePromptModeConfig,
  type PromptGeneratedSectionConfig,
  type PromptPayloadManifest,
} from "./prompt-manifest";
import { parseStructuredFile, resolvePathFromModule } from "./shared";
import { renderWorkspaceMapSection } from "./workspace-map";
import { renderResolvedUserSettingsSection } from "./user-settings-loader";
import { getRuntimeCapabilitySnapshot, renderPrimaryCapabilityAppendix } from "../../runtime/capabilities";
import { loadRuntimeSettings } from "../../runtime/load";
import { buildFilesystemPolicyPrompt } from "../../runtime/security/filesystem-manifest";

const DEFAULT_PROMPT_MANIFEST_FILE = "../config/payload-manifest.json";
const DEFAULT_KNOWLEDGE_DIR = "../brain/knowledge/";
const DEFAULT_KNOWLEDGE_MANIFEST_FILE = "../../../.runtime-state/generated/knowledge-manifest.md";
const DEFAULT_WORKSPACE_DIR = "../../../";

const FALLBACK_SYSTEM_PROMPT = [
  "You are TrenchClaw, a safety-first Solana runtime assistant.",
  "Prioritize policy compliance, capital protection, and clear user communication.",
].join(" ");

const PROMPT_MANIFEST_PATH_ENV = "TRENCHCLAW_PROMPT_MANIFEST_FILE";
const AGENT_MODE_ENV = "TRENCHCLAW_AGENT_MODE";
const KNOWLEDGE_DIR_ENV = "TRENCHCLAW_KNOWLEDGE_DIR";
const KNOWLEDGE_MANIFEST_PATH_ENV = "TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE";
const WORKSPACE_DIR_ENV = "TRENCHCLAW_WORKSPACE_DIR";

export interface SystemPromptPayload {
  mode: string;
  title: string;
  systemPrompt: string;
  promptFiles: string[];
  sections: Array<{
    order: number;
    title: string;
    kind: "file" | "generated";
    source: string;
  }>;
}

let cachedManifest: PromptPayloadManifest | null = null;
let cachedManifestPath: string | null = null;
const cachedPromptByMode = new Map<string, SystemPromptPayload>();

const injectKnowledgeDirectoryTree = async (basePrompt: string): Promise<string> => {
  const knowledgeDir = resolvePathFromModule(import.meta.url, DEFAULT_KNOWLEDGE_DIR, process.env[KNOWLEDGE_DIR_ENV]);

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

const renderKnowledgeManifestSection = async (includeFallbackTree: boolean): Promise<string> => {
  const manifestPath = resolvePathFromModule(
    import.meta.url,
    DEFAULT_KNOWLEDGE_MANIFEST_FILE,
    process.env[KNOWLEDGE_MANIFEST_PATH_ENV],
  );

  try {
    const manifestFile = Bun.file(manifestPath);
    if (await manifestFile.exists()) {
      const manifestText = (await manifestFile.text()).trim();
      if (manifestText.length > 0) {
        return `## Available Knowledge Manifest
${manifestText}`;
      }
    }
  } catch {
    // Fall through to runtime tree generation.
  }

  if (!includeFallbackTree) {
    return `## Available Knowledge Manifest
Knowledge manifest could not be loaded from "${manifestPath}".`;
  }

  return injectKnowledgeDirectoryTree("");
};

const renderWorkspaceDirectoryTreeSection = async (): Promise<string> => {
  const workspaceDir = resolvePathFromModule(import.meta.url, DEFAULT_WORKSPACE_DIR, process.env[WORKSPACE_DIR_ENV]);

  try {
    return await renderWorkspaceMapSection(workspaceDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `## Workspace Map
Workspace map could not be generated from "${workspaceDir}": ${detail}`;
  }
};

const renderResolvedUserSettingsPromptSection = async (): Promise<string> => renderResolvedUserSettingsSection();

const loadPromptManifest = async (): Promise<{
  manifest: PromptPayloadManifest | null;
  manifestPath: string;
}> => {
  const manifestPath = resolvePathFromModule(
    import.meta.url,
    DEFAULT_PROMPT_MANIFEST_FILE,
    process.env[PROMPT_MANIFEST_PATH_ENV],
  );
  if (cachedManifest && cachedManifestPath === manifestPath) {
    return { manifest: cachedManifest, manifestPath };
  }

  try {
    const parsed = parsePromptManifest(await parseStructuredFile(manifestPath), manifestPath);
    cachedManifest = parsed;
    cachedManifestPath = manifestPath;
    cachedPromptByMode.clear();
    return { manifest: parsed, manifestPath };
  } catch (error) {
    if (error instanceof Error && error.message.includes("File does not exist")) {
      cachedManifest = null;
      cachedManifestPath = manifestPath;
      cachedPromptByMode.clear();
      return { manifest: null, manifestPath };
    }
    throw error;
  }
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

const defaultGeneratedSectionTitle = (source: PromptGeneratedSectionConfig["source"]): string => {
  switch (source) {
    case "knowledgeManifest":
      return "Knowledge Manifest";
    case "knowledgeDirectoryTree":
      return "Knowledge Directory Tree";
    case "workspaceDirectoryTree":
      return "Workspace Directory Tree";
    case "resolvedUserSettings":
      return "Resolved Runtime Settings";
    case "runtimeCapabilityAppendix":
      return "Runtime Capability Appendix";
    case "filesystemPolicy":
      return "Filesystem Policy";
  }
};

const renderRuntimeCapabilityAppendixSection = async (): Promise<string> => {
  const settings = await loadRuntimeSettings();
  return renderPrimaryCapabilityAppendix(getRuntimeCapabilitySnapshot(settings));
};

const renderFilesystemPolicySection = async (): Promise<string> => {
  try {
    return `## Filesystem Policy\n${await buildFilesystemPolicyPrompt({ actor: "agent" })}`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `## Filesystem Policy\nFilesystem policy could not be loaded: ${detail}`;
  }
};

const renderGeneratedSection = async (
  section: PromptGeneratedSectionConfig,
  includeKnowledgeDirectoryTreeFallback: boolean,
): Promise<string> => {
  switch (section.source) {
    case "knowledgeManifest":
      return renderKnowledgeManifestSection(section.fallbackSource === "knowledgeDirectoryTree" || includeKnowledgeDirectoryTreeFallback);
    case "knowledgeDirectoryTree":
      return injectKnowledgeDirectoryTree("");
    case "workspaceDirectoryTree":
      return renderWorkspaceDirectoryTreeSection();
    case "resolvedUserSettings":
      return renderResolvedUserSettingsPromptSection();
    case "runtimeCapabilityAppendix":
      return renderRuntimeCapabilityAppendixSection();
    case "filesystemPolicy":
      return renderFilesystemPolicySection();
  }
};

const formatPromptAssemblyHeader = (input: {
  title: string;
  mode: string;
  sections: Array<{ order: number; title: string; kind: "file" | "generated"; source: string }>;
}): string => {
  const lines = [
    `# ${input.title}`,
    "",
    `Mode: \`${input.mode}\``,
    "",
    "## Prompt Assembly Order",
  ];

  for (const section of input.sections) {
    lines.push(`${section.order}. ${section.title}`);
    lines.push(`   - kind: \`${section.kind}\``);
    lines.push(`   - source: \`${section.source}\``);
  }

  return lines.join("\n");
};

export const loadSystemPromptPayload = async (mode = process.env[AGENT_MODE_ENV]): Promise<SystemPromptPayload> => {
  const { manifest, manifestPath } = await loadPromptManifest();
  const cacheKey = mode?.trim().length ? mode.trim() : "__default__";

  if (cachedPromptByMode.has(cacheKey)) {
    return cachedPromptByMode.get(cacheKey)!;
  }

  if (!manifest) {
    const fallbackPrompt = `# Fallback Mode

Mode: \`fallback\`

${FALLBACK_SYSTEM_PROMPT}

${(await renderKnowledgeManifestSection(true)).trim()}`.trim();
    const payload: SystemPromptPayload = {
      mode: "fallback",
      title: "Fallback Mode",
      systemPrompt: fallbackPrompt,
      promptFiles: [],
      sections: [],
    };
    cachedPromptByMode.set(cacheKey, payload);
    return payload;
  }

  const { mode: resolvedMode, modeConfig } = resolvePromptModeConfig(manifest, mode);
  const includeKnowledgeManifest = modeConfig.includeKnowledgeManifest ?? manifest.defaults?.includeKnowledgeManifest ?? true;
  const includeKnowledgeDirectoryTreeFallback =
    modeConfig.includeKnowledgeDirectoryTreeFallback ??
    manifest.defaults?.includeKnowledgeDirectoryTreeFallback ??
    true;
  const includeWorkspaceDirectoryTree =
    modeConfig.includeWorkspaceDirectoryTree ?? manifest.defaults?.includeWorkspaceDirectoryTree ?? false;

  const manifestSections = modeConfig.sections.length > 0
    ? modeConfig.sections
    : modeConfig.promptFiles.map((filePath) => ({ kind: "file" as const, title: undefined, path: filePath }));
  const payloadTitle = modeConfig.title?.trim() || `${resolvedMode[0]?.toUpperCase() ?? ""}${resolvedMode.slice(1)} Mode`;
  const visibleSections = manifestSections.filter((section) => {
    if (section.kind !== "generated") {
      return true;
    }
    if (section.source === "knowledgeManifest" && !includeKnowledgeManifest) {
      return false;
    }
    if (section.source === "workspaceDirectoryTree" && !includeWorkspaceDirectoryTree) {
      return false;
    }
    return true;
  });
  const renderedSections = await Promise.all(
    visibleSections.map(async (section, index) => {
      if (section.kind === "file") {
        const resolvedPath = resolvePromptFilePath(manifestPath, section.path);
        const content = await loadPromptFileText(manifestPath, section.path);
        return {
          order: index + 1,
          title: section.title?.trim() || path.basename(section.path),
          kind: "file" as const,
          source: resolvedPath,
          content,
        };
      }

      const content = await renderGeneratedSection(section, includeKnowledgeDirectoryTreeFallback);
      return {
        order: index + 1,
        title: section.title?.trim() || defaultGeneratedSectionTitle(section.source),
        kind: "generated" as const,
        source: `generated:${section.source}`,
        content: content.trim(),
      };
    }),
  );
  const promptFiles = renderedSections.filter((section) => section.kind === "file").map((section) => section.source);

  const header = formatPromptAssemblyHeader({
    title: payloadTitle,
    mode: resolvedMode,
    sections: renderedSections.map(({ order, title: sectionTitle, kind, source }) => ({
      order,
      title: sectionTitle,
      kind,
      source,
    })),
  });
  const body = renderedSections
    .map(
      (section) => `## Section ${section.order}: ${section.title}
Source: \`${section.source}\`

${section.content}`.trim(),
    )
    .join("\n\n");
  const systemPrompt = [header, body].filter((text) => text.trim().length > 0).join("\n\n");

  const payload: SystemPromptPayload = {
    mode: resolvedMode,
    title: payloadTitle,
    systemPrompt: systemPrompt.trim() || FALLBACK_SYSTEM_PROMPT,
    promptFiles,
    sections: renderedSections.map(({ order, title: sectionTitle, kind, source }) => ({
      order,
      title: sectionTitle,
      kind,
      source,
    })),
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
