import type { RuntimeModelToolSnapshotEntry } from "../capabilities/types";

type ToolGroupId =
  | "runtime-queue"
  | "rpc-data-fetch"
  | "wallet-execution"
  | "workspace-cli"
  | "knowledge";

const TOOL_GROUP_ORDER: readonly ToolGroupId[] = [
  "runtime-queue",
  "rpc-data-fetch",
  "wallet-execution",
  "workspace-cli",
  "knowledge",
] as const;

const TOOL_GROUP_COPY: Record<ToolGroupId, {
  title: string;
  forLine: string;
  flowLine: string;
  expectLine: string;
}> = {
  "runtime-queue": {
    title: "Runtime + Queue",
    forLine: "runtime state, memory, queued jobs, schedules, wakeups, and background-job status",
    flowLine: "use `queryRuntimeStore` for live job and schedule inspection; use queue-write tools only when the user explicitly wants durable work submitted or changed",
    expectLine: "expect inline JSON for reads or job metadata when work was accepted into the queue",
  },
  "rpc-data-fetch": {
    title: "RPC Data Fetch",
    forLine: "live wallet reads, balances, holdings, swap history, token discovery, market data, and current external data pulls",
    flowLine: "prefer one valid batch read when the schema supports it instead of many tiny duplicate calls",
    expectLine: "expect inline JSON for most reads, but heavier inventory scans may come back as queued background work",
  },
  "wallet-execution": {
    title: "Wallet Execution",
    forLine: "wallet creation, transfers, swaps, trigger orders, token-account cleanup, and trading routines",
    flowLine: "read first to remove ambiguity, then write only after the user clearly asked for the mutation",
    expectLine: "expect confirmation-sensitive writes, execution receipts, or queued routine/job records",
  },
  "workspace-cli": {
    title: "CLI + Workspace",
    forLine: "opening directories, reading exact files, writing allowed artifacts, running `rg`, checking CLI availability, and trusted local shell inspection",
    flowLine: "default sequence: `workspaceListDirectory` -> `workspaceReadFile` -> `workspaceBash`; use `workspaceWriteFile` only for exact allowed writes",
    expectLine: "expect exact relative paths, file contents, or shell stdout/stderr with a bounded timeout",
  },
  knowledge: {
    title: "Knowledge",
    forLine: "repo-authored docs, deep references, vendor snapshots, and skill packs",
    flowLine: "default sequence: `listKnowledgeDocs` -> `readKnowledgeDoc`",
    expectLine: "expect reference text, not live runtime truth; prefer live tools when current state matters",
  },
};

const hasPrefix = (value: string, prefix: string): boolean => value.startsWith(prefix);

const isRpcDataFetchTool = (toolName: string): boolean =>
  toolName === "getManagedWalletContents"
  || toolName === "getManagedWalletSolBalances"
  || toolName === "getSwapHistory"
  || toolName === "getTokenPricePerformance"
  || toolName === "getTokenHolderDistribution"
  || toolName === "rankDexscreenerTopTokenBoostsByWhales"
  || toolName === "downloadGeckoTerminalOhlcv"
  || toolName === "getLatestSolanaNews"
  || hasPrefix(toolName, "getDexscreener")
  || hasPrefix(toolName, "searchDexscreener");

const isRuntimeQueueTool = (toolName: string): boolean =>
  toolName === "queryRuntimeStore"
  || toolName === "queryInstanceMemory"
  || toolName === "mutateInstanceMemory"
  || toolName === "pingRuntime"
  || toolName === "enqueueRuntimeJob"
  || toolName === "manageRuntimeJob"
  || toolName === "submitTradingRoutine"
  || toolName === "runWakeupCheck"
  || toolName === "sleep";

const isKnowledgeTool = (toolName: string): boolean =>
  toolName === "listKnowledgeDocs" || toolName === "readKnowledgeDoc";

const isWorkspaceTool = (toolName: string): boolean =>
  toolName === "workspaceListDirectory"
  || toolName === "workspaceReadFile"
  || toolName === "workspaceWriteFile"
  || toolName === "workspaceBash";

const classifyToolGroup = (tool: RuntimeModelToolSnapshotEntry): ToolGroupId => {
  if (isKnowledgeTool(tool.name)) {
    return "knowledge";
  }
  if (isWorkspaceTool(tool.name)) {
    return "workspace-cli";
  }
  if (isRuntimeQueueTool(tool.name)) {
    return "runtime-queue";
  }
  if (isRpcDataFetchTool(tool.name)) {
    return "rpc-data-fetch";
  }
  return "wallet-execution";
};

const formatToolList = (tools: RuntimeModelToolSnapshotEntry[]): string =>
  tools.map((tool) => `\`${tool.name}\``).join(", ");

export const renderCommandMenuSection = (tools: RuntimeModelToolSnapshotEntry[], heading = "## Command Menu"): string => {
  const grouped = new Map<ToolGroupId, RuntimeModelToolSnapshotEntry[]>();
  for (const tool of tools) {
    const group = classifyToolGroup(tool);
    const existing = grouped.get(group);
    if (existing) {
      existing.push(tool);
      continue;
    }
    grouped.set(group, [tool]);
  }

  const lines = [
    heading,
    "- Treat these as command groups. Pick the smallest group and smallest tool that can answer the request.",
    "- If a tool is not listed inside these groups for the current request, it is unavailable.",
  ];

  for (const groupId of TOOL_GROUP_ORDER) {
    const toolsInGroup = grouped.get(groupId)?.toSorted((left, right) => left.name.localeCompare(right.name)) ?? [];
    if (toolsInGroup.length === 0) {
      continue;
    }
    const copy = TOOL_GROUP_COPY[groupId];
    lines.push(`### ${copy.title}`);
    lines.push(`- for: ${copy.forLine}`);
    lines.push(`- default flow: ${copy.flowLine}`);
    lines.push(`- expect: ${copy.expectLine}`);
    lines.push(`- tools: ${formatToolList(toolsInGroup)}`);
  }

  return lines.join("\n");
};

export const renderWorkspaceDirectoryMapSection = (): string => [
  "## Workspace Directory Map",
  "- The runtime workspace is instance-scoped. Treat all workspace paths as relative to that active instance root.",
  "- `strategies/`: strategy drafts, plans, and operator-authored working material.",
  "- `configs/`: config fragments and runtime-side config artifacts.",
  "- `typescript/`: TypeScript helpers or code artifacts placed in the workspace surface.",
  "- `notes/`: operator notes and durable scratch notes.",
  "- `notes/research/`: deeper research notes and investigation writeups.",
  "- `news/`: saved news pulls and normalized news artifacts.",
  "- `scratch/`: disposable working files and temporary outputs.",
  "- `output/`: generated artifacts meant to be kept.",
  "- `output/research/market-data/geckoterminal/ohlcv/`: raw GeckoTerminal OHLCV downloads.",
  "- `routines/`: durable JSON routines and schedule-oriented runtime payloads.",
].join("\n");

export const renderAsyncToolBehaviorSection = (tools: RuntimeModelToolSnapshotEntry[]): string => {
  const toolNames = new Set(tools.map((tool) => tool.name));
  const hasQueueInspection = toolNames.has("queryRuntimeStore");
  const hasSleepTool = toolNames.has("sleep");
  const hasWorkspaceBash = toolNames.has("workspaceBash");
  const hasBatchMarketReads = toolNames.has("getDexscreenerTokensByChain");

  const lines = [
    "## Async Tool Behavior",
    "- Inline reads usually return final JSON in the same step. Report what the tool actually returned, not what you hoped it would return.",
    "- Some tools can accept work without finishing it inline. If the payload says the work was queued or includes job metadata, treat that as accepted background work, not a completed result.",
    hasQueueInspection
      ? "- When work is queued, use `queryRuntimeStore` to inspect job state, upcoming schedules, or background progress instead of guessing."
      : "- When work is queued, tell the user the job/status you received and do not pretend the background work already finished.",
    "- Runtime RPC lanes may be throttled or staggered behind the scenes. A delayed result is not the same thing as a failed result.",
    "- While waiting on queueing or throttling, you may keep doing other useful read-only work such as browsing directories, reading files, or opening knowledge docs if that advances the task.",
    "- Do not fire duplicate speculative reads just because an earlier read is taking time. Wait for the in-flight result or switch to another useful surface.",
    hasBatchMarketReads
      ? "- `getDexscreenerTokensByChain` supports batch reads of up to 30 `tokenAddresses`; prefer one valid batch over many small repeated calls."
      : "- Prefer one schema-valid batch call over many tiny repeated calls whenever the tool supports batching.",
  ];

  if (hasSleepTool) {
    lines.push("- Use `sleep` only for deliberate retry gaps or scheduled routine steps, not as a default substitute for reading queue state.");
  }

  if (hasWorkspaceBash) {
    lines.push("- `workspaceBash` is synchronous and timeout-bound. Use it for `pwd`, `ls`, `rg`, `command -v`, and CLI help, not for long-lived background daemons.");
  }

  lines.push("- For multi-step work, keep the user oriented with short status notes that say what you are opening, what you are waiting on, and what result changed the next step.");

  return lines.join("\n");
};
