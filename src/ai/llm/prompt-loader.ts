import { fileURLToPath } from "node:url";
import { renderDirectoryTree } from "../../brain/knowledge/knowledge-tree";

const DEFAULT_PROMPT_FILE = "../../brain/protected/prompts/system.md";
const DEFAULT_KNOWLEDGE_DIR = "../../brain/knowledge/";
const DEFAULT_KNOWLEDGE_MANIFEST_FILE = "../../brain/knowledge/KNOWLEDGE_MANIFEST.md";

const FALLBACK_SYSTEM_PROMPT = [
  "You are TrenchClaw, a safety-first Solana runtime operator.",
  "Prioritize policy compliance, capital protection, and clear operator communication.",
].join(" ");

const SYSTEM_PROMPT_PATH_ENV = "TRENCHCLAW_SYSTEM_PROMPT_FILE";
const KNOWLEDGE_DIR_ENV = "TRENCHCLAW_KNOWLEDGE_DIR";
const KNOWLEDGE_MANIFEST_PATH_ENV = "TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE";

let cachedPrompt: string | null = null;

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

const injectKnowledgeManifest = async (basePrompt: string): Promise<string> => {
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

  return injectKnowledgeDirectoryTree(basePrompt);
};

export const loadDefaultSystemPrompt = async (): Promise<string> => {
  if (cachedPrompt) {
    return cachedPrompt;
  }

  const promptPath = resolvePath(DEFAULT_PROMPT_FILE, process.env[SYSTEM_PROMPT_PATH_ENV]);
  const file = Bun.file(promptPath);
  if (!(await file.exists())) {
    cachedPrompt = await injectKnowledgeManifest(FALLBACK_SYSTEM_PROMPT);
    return cachedPrompt;
  }

  const text = (await file.text()).trim();
  cachedPrompt = await injectKnowledgeManifest(text || FALLBACK_SYSTEM_PROMPT);
  return cachedPrompt;
};
