import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDirectoryTree } from "../../src/ai/brain/knowledge/knowledge-tree";

const KNOWLEDGE_DIR = fileURLToPath(new URL("../../src/ai/brain/knowledge/", import.meta.url));
const MANIFEST_PATH = fileURLToPath(new URL("../../src/ai/brain/knowledge/KNOWLEDGE_MANIFEST.md", import.meta.url));

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
await writeFile(MANIFEST_PATH, markdown, "utf8");

console.log(`Knowledge manifest refreshed: ${MANIFEST_PATH}`);
