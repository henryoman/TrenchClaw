import { TOOL_GROUP_IDS, resolveToolGroup, type RuntimeModelToolSnapshotEntry, type ToolGroupId } from "../tools";

export const TOOL_GROUP_ORDER: readonly ToolGroupId[] = TOOL_GROUP_IDS;

const TOOL_GROUP_COPY: Record<ToolGroupId, {
  title: string;
  forLine: string;
  flowLine: string;
  expectLine: string;
}> = {
  "runtime-queue": {
    title: "Runtime + Queue",
    forLine: "runtime state, memory, queued jobs, schedules, wakeups, and background-job status",
    flowLine: "use `queryRuntimeStore` for live job/schedule inspection and older conversation slices; use queue-write tools only when the user explicitly wants durable work submitted or changed",
    expectLine: "expect inline JSON for reads or job metadata when work was accepted into the queue",
  },
  "rpc-data-fetch": {
    title: "RPC Data Fetch",
    forLine: "live wallet reads, balances, holdings, swap history, token discovery, market data, and current external data pulls",
    flowLine: "prefer one valid batch read when the schema supports it instead of many tiny duplicate calls",
    expectLine: "expect inline JSON for most reads, but heavier inventory scans may come back as queued background work",
  },
  "market-news": {
    title: "Market + News",
    forLine: "headline pulls, sentiment, trend reads, token discovery, launch timing, holder concentration, and market comparison work",
    flowLine: "start with the smallest discovery or market tool that identifies the asset cleanly, then follow with one concrete comparison or deep read if needed",
    expectLine: "expect inline JSON snapshots, token metadata, market fields, or saved news artifacts in the workspace",
  },
  "wallet-execution": {
    title: "Wallet Execution",
    forLine: "wallet creation, transfers, swaps, trigger orders, token-account cleanup, and trading routines",
    flowLine: "resolve ambiguity or required live state first; if only one required field is missing, ask for that field instead of starting a broader read chain; then write only after the user clearly asked for the mutation",
    expectLine: "expect confirmation-sensitive writes, execution receipts, or queued routine/job records",
  },
  "workspace-cli": {
    title: "CLI + Workspace",
    forLine: "opening directories, reading exact files, writing allowed artifacts, running `rg`, checking CLI availability, simple HTTP fetches, and trusted local shell inspection",
    flowLine: "default sequence: `workspaceListDirectory` -> `workspaceReadFile` -> `workspaceBash`; when you use `workspaceBash`, always send `type` plus the basic params for that mode; use `workspaceWriteFile` only for exact allowed writes",
    expectLine: "expect exact relative paths, file contents, or shell stdout/stderr with a bounded timeout",
  },
  knowledge: {
    title: "Knowledge",
    forLine: "repo-authored docs, deep references, vendor snapshots, and skill packs",
    flowLine: "default sequence: `listKnowledgeDocs` -> `readKnowledgeDoc`",
    expectLine: "expect reference text, not live runtime truth; prefer live tools when current state matters",
  },
};

const getToolGroupTitle = (groupId: ToolGroupId): string => TOOL_GROUP_COPY[groupId].title;
const getToolGroup = (tool: RuntimeModelToolSnapshotEntry): ToolGroupId => tool.group ?? resolveToolGroup(tool.name);

const getEnabledToolGroupIds = (tools: RuntimeModelToolSnapshotEntry[]): ToolGroupId[] =>
  TOOL_GROUP_ORDER.filter((groupId) => tools.some((tool) => getToolGroup(tool) === groupId));

export const renderModelAccessSummarySection = (tools: RuntimeModelToolSnapshotEntry[]): string => {
  const sortedTools = tools.toSorted((left, right) => left.name.localeCompare(right.name));
  const enabledGroupIds = getEnabledToolGroupIds(sortedTools);
  const mutatingTools = sortedTools.filter((tool) =>
    tool.sideEffectLevel !== "read"
    && getToolGroup(tool) !== "workspace-cli"
    && getToolGroup(tool) !== "knowledge");
  const hasRuntimeStoreRead = sortedTools.some((tool) => tool.name === "queryRuntimeStore");

  return [
    "## What You Can See Right Now",
    "- current conversation context: this request's messages plus a **token-bounded** same-conversation history window when persisted; preloaded rows are prefixed `[History #i/N | messageId=…]` (oldest `i=1` in the window)",
    "- live injected context: current clock, SOL snapshot, upcoming trading schedule, wallet summary, and a short **knowledge orientation** (not full docs — retrieve with `listKnowledgeDocs` / `readKnowledgeDoc`)",
    hasRuntimeStoreRead
      ? "- older same-conversation history and other runtime records: not preloaded beyond that window; use `queryRuntimeStore` (`getConversationHistorySlice` with `beforeMessageId` from `[History #1/…]`, or other request types) only when you need deeper history or runtime state"
      : "- other chats/runtime records: not preloaded and not directly available in this request",
    "- protected material: vaults, keypairs, and hidden tools are not directly available",
    "",
    "## Tool Surface For This Turn",
    "- only the tools registered for this request are callable",
    `- enabled command groups: ${enabledGroupIds.map(getToolGroupTitle).join(", ") || "none"}`,
    `- write or execute tools registered: ${mutatingTools.length > 0 ? "yes" : "no"}`,
  ].join("\n");
};

export const renderCommandMenuSection = (tools: RuntimeModelToolSnapshotEntry[], heading = "## Command Menu"): string => {
  const grouped = new Map<ToolGroupId, RuntimeModelToolSnapshotEntry[]>();
  for (const tool of tools) {
    const group = getToolGroup(tool);
    const existing = grouped.get(group);
    if (existing) {
      existing.push(tool);
      continue;
    }
    grouped.set(group, [tool]);
  }

  const lines = [
    heading,
    "- Think in command groups first. Pick the smallest group and smallest tool that can answer the request.",
    "- If a group is missing for this request, those tools are unavailable.",
    "- Call tools with one JSON object that matches the registered schema.",
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
    lines.push(`- available now: ${toolsInGroup.length} tool${toolsInGroup.length === 1 ? "" : "s"}`);
  }

  return lines.join("\n");
};

export const renderWorkspaceDirectoryMapSection = (): string => [
  "## Workspace Directory Map",
  "- The runtime workspace is instance-scoped. Treat all workspace paths as relative to that active instance root.",
  "- `strategies/`: strategy drafts, plans, and operator-authored working material.",
  "- `configs/`: config fragments and runtime-side config artifacts.",
  "- `configs/news-feeds.json`: instance-scoped RSS and Atom feed registry; use `getConfiguredNewsFeeds` or `workspaceReadFile` when you need exact feed aliases or URLs.",
  "- `configs/tracker.json`: instance-scoped tracked wallets and tracked tokens; use `getWalletTracker` for a compact summary or `workspaceReadFile`/`workspaceWriteFile` for exact edits.",
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
    lines.push("- `workspaceBash` is synchronous and timeout-bound. Put its command mode in top-level `type`, using values like `cli`, `version`, `help`, `which`, `search_text`, `list_directory`, `http_get`, or `shell`. Do not use it for long-lived background daemons.");
    lines.push("- Use `workspaceBash` for CLI programs like `solana`, `solana-keygen`, `helius`, `dune`, `bun`, or other host commands when present in PATH.");
  }

  lines.push("- For multi-step work, keep the user oriented with short status notes that say what you are opening, what you are waiting on, and what result changed the next step.");

  return lines.join("\n");
};
