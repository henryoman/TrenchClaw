import type { RuntimeCapabilitySnapshot, RuntimeModelToolSnapshotEntry } from "./types";

const renderToolList = (tools: RuntimeModelToolSnapshotEntry[]): string =>
  tools.length === 0
    ? "- none"
    : tools
      .map((toolEntry) =>
        `- \`${toolEntry.name}\` (${toolEntry.kind}, ${toolEntry.sideEffectLevel}, ${toolEntry.releaseReadinessStatus}) - ${toolEntry.routingHint}`)
      .join("\n");

export const renderRuntimeToolContractSection = (snapshot: RuntimeCapabilitySnapshot): string => `## Enabled Model Tools
Only use tools listed here. Every listed tool is registered in chat for this request.

### Exact Tool Allowlist
${snapshot.modelTools.map((entry) => `\`${entry.name}\``).join(", ") || "none"}

### Tool Routing
${renderToolList(snapshot.modelTools)}`.trim();
