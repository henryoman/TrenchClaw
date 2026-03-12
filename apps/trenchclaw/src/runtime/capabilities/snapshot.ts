import type { RuntimeCapabilitySnapshot } from "./types";

const toMarkdownTable = (headers: string[], rows: string[][]): string => {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerLine, dividerLine, body].filter((line) => line.length > 0).join("\n");
};

const formatJsonExample = (value: unknown): string =>
  value === undefined ? "" : `\nExample input:\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

export const renderRuntimeActionCatalogTable = (snapshot: RuntimeCapabilitySnapshot): string =>
  toMarkdownTable(
    [
      "actionName",
      "category",
      "subcategory",
      "enabledBySettings",
      "chatExposed",
      "requiresConfirmation",
      "inputSchema",
      "outputSchema",
    ],
    snapshot.actions.map((entry) => [
      entry.name,
      entry.category,
      entry.subcategory ?? "",
      entry.enabledBySettings ? "yes" : "no",
      entry.chatExposed ? "yes" : "no",
      entry.requiresUserConfirmation ? "yes" : "no",
      entry.hasInputSchema ? "yes" : "no",
      entry.hasOutputSchema ? "yes" : "no",
    ]),
  );

export const renderRuntimeChatToolCatalogTable = (snapshot: RuntimeCapabilitySnapshot): string =>
  toMarkdownTable(
    ["toolName", "kind", "enabledBySettings", "requiresConfirmation"],
    snapshot.chatTools.map((entry) => [
      entry.name,
      entry.kind,
      entry.enabledBySettings ? "yes" : "no",
      entry.requiresUserConfirmation ? "yes" : "no",
    ]),
  );

export const renderPrimaryCapabilityAppendix = (snapshot: RuntimeCapabilitySnapshot): string => {
  const actionBlocks = snapshot.actions
    .map((entry) => {
      const statusBits = [
        `enabledBySettings=\`${entry.enabledBySettings ? "yes" : "no"}\``,
        `chatExposed=\`${entry.chatExposed ? "yes" : "no"}\``,
        `requiresConfirmation=\`${entry.requiresUserConfirmation ? "yes" : "no"}\``,
      ].join(", ");
      return `### \`${entry.name}\`
Category: \`${entry.category}${entry.subcategory ? `/${entry.subcategory}` : ""}\`
Status: ${statusBits}
Purpose: ${entry.purpose}
Description: ${entry.description}
Tags: ${entry.tags.join(", ") || "none"}${formatJsonExample(entry.exampleInput)}`;
    })
    .join("\n\n");

  const workspaceBlocks = snapshot.workspaceTools
    .filter((entry) => entry.enabledBySettings || entry.chatExposed)
    .map((entry) => {
      const statusBits = [
        `enabledBySettings=\`${entry.enabledBySettings ? "yes" : "no"}\``,
        `chatExposed=\`${entry.chatExposed ? "yes" : "no"}\``,
      ].join(", ");
      return `### \`${entry.name}\`
Status: ${statusBits}
Purpose: ${entry.purpose}
Description: ${entry.description}
Tags: ${entry.tags.join(", ") || "none"}${formatJsonExample(entry.exampleInput)}`;
    })
    .join("\n\n");

  const callableToolNames = snapshot.chatTools.map((entry) => `\`${entry.name}\``).join(", ") || "none";

  return `## Live Callable Capability Appendix
This appendix is generated from the runtime capability registry. Treat it as the live capability metadata source for names, intent, exposure, and example input shapes.

### How To Read This Appendix
1. \`Runtime Chat Tool Catalog\` is the exact callable tool allowlist for this run.
2. If a tool or action name appears elsewhere in the repo, docs, or workspace tree but does not appear in \`Runtime Chat Tool Catalog\`, treat it as unavailable.
3. CLI access is available only through \`workspaceBash\`. Direct file access uses \`workspaceReadFile\` and \`workspaceWriteFile\`.
4. Documentation/query surfaces come from the injected \`Knowledge Manifest\` and \`Workspace Context Snapshot\`.
5. Treat \`src/ai/brain/knowledge/deep-knowledge/*.md\` as long-form references, \`src/ai/brain/knowledge/skills/*/SKILL.md\` as workflow guides, and \`src/ai/brain/knowledge/skills/*/references/*.md\` as topical docs.
6. For structured runtime data, prefer JSON-style read actions such as \`queryRuntimeStore\` and \`queryInstanceMemory\` instead of shell commands.
7. For docs and code, use \`workspaceBash\` to discover file paths and \`workspaceReadFile\` to open the exact files.

### Exact Callable Tool Names
${callableToolNames}

### Runtime Action Catalog
${renderRuntimeActionCatalogTable(snapshot)}

${actionBlocks}

### Runtime Chat Tool Catalog
${renderRuntimeChatToolCatalogTable(snapshot)}

### Workspace Tool Catalog
${workspaceBlocks}`.trim();
};
