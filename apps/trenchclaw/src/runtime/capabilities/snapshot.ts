import type { RuntimeCapabilitySnapshot, RuntimeModelToolSnapshotEntry } from "./types";

const toMarkdownTable = (headers: string[], rows: string[][]): string => {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerLine, dividerLine, body].filter((line) => line.length > 0).join("\n");
};

const renderToolList = (tools: RuntimeModelToolSnapshotEntry[]): string =>
  tools.length === 0
    ? "- none"
    : tools
      .map((toolEntry) =>
        `- \`${toolEntry.name}\` (${toolEntry.kind}, ${toolEntry.sideEffectLevel}) - ${toolEntry.routingHint}`)
      .join("\n");

export const renderRuntimeActionCatalogTable = (snapshot: RuntimeCapabilitySnapshot): string =>
  toMarkdownTable(
    [
      "actionName",
      "category",
      "subcategory",
      "enabledNow",
      "requiresConfirmation",
      "inputSchema",
      "outputSchema",
    ],
    snapshot.actions.map((entry) => [
      entry.name,
      entry.category,
      entry.subcategory ?? "",
      entry.enabledNow ? "yes" : "no",
      entry.requiresConfirmation ? "yes" : "no",
      entry.hasInputSchema ? "yes" : "no",
      entry.hasOutputSchema ? "yes" : "no",
    ]),
  );

export const renderRuntimeModelToolCatalogTable = (snapshot: RuntimeCapabilitySnapshot): string =>
  toMarkdownTable(
    ["toolName", "kind", "sideEffectLevel", "requiresConfirmation"],
    snapshot.modelTools.map((entry) => [
      entry.name,
      entry.kind,
      entry.sideEffectLevel,
      entry.requiresConfirmation ? "yes" : "no",
    ]),
  );

export const renderRuntimeToolContractSection = (snapshot: RuntimeCapabilitySnapshot): string => `## Enabled Model Tools
Only use tools listed here. Every listed tool is registered in chat for this request.

### Exact Tool Allowlist
${snapshot.modelTools.map((entry) => `\`${entry.name}\``).join(", ") || "none"}

### Tool Routing
${renderToolList(snapshot.modelTools)}`.trim();
