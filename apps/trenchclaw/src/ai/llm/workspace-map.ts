import path from "node:path";

import { renderDirectoryTree } from "../../lib/knowledge/knowledge-index";

export const renderWorkspaceMapSection = async (workspaceDir: string): Promise<string> => {
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  const rootLabel = resolvedWorkspaceDir.endsWith(`${path.sep}apps${path.sep}trenchclaw`)
    ? "apps/trenchclaw"
    : path.basename(resolvedWorkspaceDir);
  const tree = await renderDirectoryTree(workspaceDir);
  return `## Workspace Map (${rootLabel}/)
Use this as the source of truth for where files live in the current codebase.
\`\`\`text
# WORKSPACE ROOT: ${rootLabel}/
${tree}
\`\`\``;
};
