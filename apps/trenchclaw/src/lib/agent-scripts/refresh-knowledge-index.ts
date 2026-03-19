import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { renderKnowledgeIndexMarkdown } from "../knowledge/knowledge-index";
import { assertWritePathInRoots } from "../../runtime/security/write-scope";
import { CORE_APP_ROOT, GENERATED_STATE_ROOT } from "../../runtime/runtime-paths";

const KNOWLEDGE_DIR = process.env.TRENCHCLAW_KNOWLEDGE_DIR || join(CORE_APP_ROOT, "src/ai/brain/knowledge");
const KNOWLEDGE_INDEX_PATH = `${GENERATED_STATE_ROOT}/knowledge-index.md`;

export const refreshKnowledgeIndex = async (): Promise<string[]> => {
  const generatedAt = new Date().toISOString();
  const markdown = await renderKnowledgeIndexMarkdown(KNOWLEDGE_DIR, generatedAt);

  await mkdir(dirname(KNOWLEDGE_INDEX_PATH), { recursive: true });
  assertWritePathInRoots({
    targetPath: KNOWLEDGE_INDEX_PATH,
    roots: [".trenchclaw-generated"],
    scope: "system-knowledge-refresh",
    operation: "write knowledge index",
  });
  await writeFile(KNOWLEDGE_INDEX_PATH, markdown, "utf8");

  return [`Knowledge index refreshed: ${KNOWLEDGE_INDEX_PATH}`];
};

if (import.meta.main) {
  for (const line of await refreshKnowledgeIndex()) {
    console.log(line);
  }
}
