import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDirectoryTree } from "../../ai/brain/knowledge/knowledge-tree";
import { assertWritePathInRoots } from "../../runtime/security/write-scope";

const KNOWLEDGE_DIR = fileURLToPath(new URL("../../ai/brain/knowledge/", import.meta.url));
const MANIFEST_PATH = fileURLToPath(new URL("../../ai/brain/knowledge/KNOWLEDGE_MANIFEST.md", import.meta.url));

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
    roots: ["src/ai/brain/knowledge"],
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
