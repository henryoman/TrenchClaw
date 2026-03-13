import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { renderDirectoryTree } from "../../ai/brain/knowledge/knowledge-tree";
import { assertWritePathInRoots } from "../../runtime/security/write-scope";
import { CORE_APP_ROOT, RUNTIME_GENERATED_ROOT } from "../../runtime/runtime-paths";

const KNOWLEDGE_DIR = process.env.TRENCHCLAW_KNOWLEDGE_DIR || join(CORE_APP_ROOT, "src/ai/brain/knowledge");
const MANIFEST_PATH = `${RUNTIME_GENERATED_ROOT}/knowledge-manifest.md`;

export const refreshKnowledgeManifest = async (): Promise<string[]> => {
  const generatedAt = new Date().toISOString();
  const tree = await renderDirectoryTree(KNOWLEDGE_DIR);

  const markdown = `# Knowledge Manifest

Generated at: ${generatedAt}
Root: src/ai/brain/knowledge

Use this inventory to decide which files to read.

\`\`\`text
${tree}
\`\`\`
`;

  await mkdir(dirname(MANIFEST_PATH), { recursive: true });
  assertWritePathInRoots({
    targetPath: MANIFEST_PATH,
    roots: [".runtime-state/generated"],
    scope: "system-knowledge-refresh",
    operation: "write knowledge manifest",
  });
  await writeFile(MANIFEST_PATH, markdown, "utf8");

  return [`Knowledge manifest refreshed: ${MANIFEST_PATH}`];
};

if (import.meta.main) {
  for (const line of await refreshKnowledgeManifest()) {
    console.log(line);
  }
}
