import { renderDirectoryTree } from "../brain/knowledge/knowledge-tree";

export const renderWorkspaceMapSection = async (workspaceDir: string): Promise<string> => {
  const tree = await renderDirectoryTree(workspaceDir);
  return `## Workspace Map (src/)
Use this as the source of truth for where files live in the current codebase.
\`\`\`text
# WORKSPACE ROOT: src/
${tree}
\`\`\``;
};
