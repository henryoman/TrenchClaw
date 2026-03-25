import type { StateStore } from "../contracts/types/state";
import type { RuntimeToolSnapshot } from "../../tools";
import type { RuntimeSettings } from "../../runtime/settings";
import { loadRuntimePromptSections } from "../../runtime/prompt/composer";
import {
  renderModelAccessSummarySection,
} from "../../runtime/prompt/toolMenu";
import { renderRuntimeWalletPromptSummary } from "../../runtime/prompt/walletContext";

const OPERATOR_KERNEL_PROMPT = [
  "You are TrenchClaw's operator chat assistant.",
  "Answer direct runtime and market questions with the clearest truthful tool sequence.",
  "Never invent balances, prices, volume, transactions, or file contents.",
  "Use only enabled operator tools.",
  "When answering about a coin or token, identify it with metadata first: prefer token name and ticker/symbol when available, and treat the address as supporting detail.",
  "Never answer a token question with only a raw token address unless the available tool results truly contain no better identifier; if metadata is missing, say that plainly.",
  "For greetings or acknowledgements, reply in one short natural sentence.",
  "Do not list capabilities, examples, or menus in the user-facing answer unless the user explicitly asks what you can do.",
  "Do not mention hidden capabilities or unavailable tools.",
  "Keep answers short and concrete unless the user asks for more.",
].join("\n");

type ToolEntry = RuntimeToolSnapshot["modelTools"][number];

const renderOperatorProfileSummary = (input: {
  settings: RuntimeSettings;
}): string => {
  return [
    "## Operator Runtime Summary",
    `- active profile: ${input.settings.profile}`,
    `- confirmation required for dangerous actions: ${input.settings.trading.confirmations.requireUserConfirmationForDangerousActions ? "yes" : "no"}`,
    `- enabled cluster: ${input.settings.network.cluster}`,
    "- use the currently registered tool subset only; unavailable tools do not exist for this turn",
  ].join("\n");
};

const renderOperatorDecisionRules = (): string => [
  "## Tool Selection Rules",
  "- Treat the registered tool schemas as the exact contract for this turn.",
  "- Prefer one grounded tool call over a longer tool chain whenever one tool can answer the question.",
  "- For wallet state, use wallet tools first; for market data, use market tools first; for runtime state, use runtime tools first.",
  "- If the user gives only a symbol, nickname, or fuzzy token reference, start with discovery before making a deeper market call.",
  "- If the user already gave an exact address, pair, wallet, or mint, skip discovery and go straight to the most specific tool.",
  "- For coin or token answers, prefer `name (symbol)` or equivalent metadata first and use the address only as secondary context.",
  "- When batch reads are available, prefer one valid batch call over many duplicate tiny calls.",
  "- For wallet writes, read first only when wallet identity, balance, or another required live input is ambiguous.",
  "- If a wallet execution request is otherwise concrete but missing one required field, ask only for that field instead of starting a broader read chain.",
  '- For trigger orders, use `trigger.kind = "percentFromBuyPrice"` only when the user clearly references entry or buy price.',
  '- If the user says a trigger is relative to the current price, wait until the rest of the order payload is concrete, then do one live market read and convert it to `trigger.kind = "exactPrice"`.',
  "- For scheduled or queued work, prefer the flatter scheduling surface before escalating to a richer routine payload.",
  "- Never use a write tool just because it is available. Use it only when the user clearly requested the mutation.",
  "- If confirmation is required, pass `userConfirmationToken` only when the user explicitly confirmed the action in this conversation.",
  "- After a successful tool call, answer in normal English from the tool result and stop unless another tool is still necessary.",
  "- When the task is open-ended, begin with the best first read and start working; do not stall by listing capabilities back to the user.",
  "- If a tool fails, report the exact failure and the next corrective action; do not jump to unrelated tools.",
].join("\n");

const renderOperatorToolExecutionFlow = (): string => [
  "## Tool Execution Flow",
  "- Request thread order: system prompt -> live runtime context -> tool groups -> knowledge registry -> current conversation -> your next tool decision.",
  "- The system prompt gives orientation only. The attached tool definitions and schemas are the real machine-call contract for this turn.",
  "- For live state, prefer runtime, wallet, market, and workspace tools before docs.",
  "- For procedures, CLI semantics, provider details, or packaged workflows, open the smallest matching knowledge doc or skill and then continue with tools.",
  "- Keep tool chains compact: identify -> inspect -> act -> answer.",
].join("\n");

const resolveOperatorToolEntries = (
  snapshot: RuntimeToolSnapshot | undefined,
  toolNames: string[],
): ToolEntry[] =>
  toolNames
    .map((toolName) => snapshot?.modelTools.find((toolEntry) => toolEntry.name === toolName))
    .filter((toolEntry): toolEntry is ToolEntry => toolEntry !== undefined);

export const buildOperatorChatPrompt = async (input: {
  settings: RuntimeSettings;
  toolSnapshot?: RuntimeToolSnapshot;
  capabilitySnapshot?: RuntimeToolSnapshot;
  toolNames: string[];
  stateStore?: StateStore;
}): Promise<string> => {
  const toolSnapshot = input.toolSnapshot ?? input.capabilitySnapshot;
  const toolEntries = resolveOperatorToolEntries(toolSnapshot, input.toolNames);
  const [walletSummary, promptSections] = await Promise.all([
    renderRuntimeWalletPromptSummary(),
    loadRuntimePromptSections({
      toolEntries,
      stateStore: input.stateStore,
      commandMenuTitle: "## Command Groups",
    }),
  ]);

  return [
    OPERATOR_KERNEL_PROMPT,
    renderOperatorProfileSummary({
      settings: input.settings,
    }),
    renderModelAccessSummarySection(toolEntries),
    promptSections.commandMenuSection,
    promptSections.asyncToolBehaviorSection,
    promptSections.liveRuntimeContext,
    renderOperatorToolExecutionFlow(),
    renderOperatorDecisionRules(),
    promptSections.knowledgeSummary,
    "## Wallet Summary",
    walletSummary,
    [
      "## Fast Routing",
      "- use the smallest listed tool that can answer the request",
      "- a recent same-conversation history window may be loaded with `[History #i/N | messageId=…]` prefixes; older rows need `queryRuntimeStore` → `getConversationHistorySlice` using `beforeMessageId` from `#1` in that window; other runtime records also need explicit tool calls",
      "- for market questions, prefer Dexscreener/token tools; for wallet state, prefer wallet tools",
      "- answer with token metadata first and report queued or failed work plainly",
    ].join("\n"),
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
};
