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

export const renderOperatorCapabilityAppendix = (snapshot: RuntimeCapabilitySnapshot): string => {
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

  return `## Live Callable Capability Appendix
This appendix is generated from the runtime capability registry. Treat it as the live capability metadata source for names, intent, exposure, and example input shapes.

### Runtime Action Catalog
${renderRuntimeActionCatalogTable(snapshot)}

${actionBlocks}

### Runtime Chat Tool Catalog
${renderRuntimeChatToolCatalogTable(snapshot)}

### Workspace Tool Catalog
${workspaceBlocks}`.trim();
};
