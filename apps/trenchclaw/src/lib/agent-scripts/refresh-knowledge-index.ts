import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { renderKnowledgeIndexMarkdown } from "../knowledge/knowledge-index";
import { assertWritePathInRoots } from "../../runtime/security/write-scope";
import { CORE_APP_ROOT } from "../../runtime/runtime-paths";
import { resolveRequiredActiveInstanceIdSync } from "../../runtime/instance-state";
import { resolveInstanceGeneratedRoot, resolveInstanceKnowledgeIndexPath } from "../../runtime/instance-paths";

const KNOWLEDGE_DIR = process.env.TRENCHCLAW_KNOWLEDGE_DIR || join(CORE_APP_ROOT, "src/ai/brain/knowledge");

export const refreshKnowledgeIndex = async (): Promise<string[]> => {
  const activeInstanceId = resolveRequiredActiveInstanceIdSync(
    "No active instance selected. Knowledge index snapshots are instance-scoped.",
  );
  const generatedRoot = resolveInstanceGeneratedRoot(activeInstanceId);
  const knowledgeIndexPath = resolveInstanceKnowledgeIndexPath(activeInstanceId);
  const generatedAt = new Date().toISOString();
  const markdown = await renderKnowledgeIndexMarkdown(KNOWLEDGE_DIR, generatedAt);

  await mkdir(dirname(knowledgeIndexPath), { recursive: true });
  assertWritePathInRoots({
    targetPath: knowledgeIndexPath,
    roots: [generatedRoot],
    scope: "system-knowledge-refresh",
    operation: "write knowledge index",
  });
  await writeFile(knowledgeIndexPath, markdown, "utf8");

  return [`Knowledge index refreshed: ${knowledgeIndexPath}`];
};

if (import.meta.main) {
  for (const line of await refreshKnowledgeIndex()) {
    console.log(line);
  }
}
