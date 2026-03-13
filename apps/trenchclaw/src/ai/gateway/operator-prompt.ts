import type { RuntimeCapabilitySnapshot } from "../../runtime/capabilities";
import type { RuntimeSettings } from "../../runtime/load";
import { renderRuntimeWalletPromptSummary } from "../../runtime/wallet-model-context";

const PROMPT_CHAR_LIMIT = 8_000;
const WALLET_SUMMARY_CHAR_LIMIT = 1_200;
const OPERATOR_KERNEL_PROMPT = [
  "You are TrenchClaw's operator chat assistant.",
  "Answer direct runtime and market questions with the smallest truthful tool sequence.",
  "Never invent balances, prices, volume, transactions, or file contents.",
  "Use only enabled operator tools.",
  "Do not mention hidden capabilities or unavailable tools.",
  "Keep answers short and concrete unless the user asks for more.",
].join("\n");

const truncate = (value: string, limit: number): string =>
  value.length > limit ? `${value.slice(0, Math.max(0, limit - 14))}\n...[truncated]` : value;

const renderOperatorProfileSummary = (settings: RuntimeSettings): string => [
  "## Operator Runtime Summary",
  `- active profile: ${settings.profile}`,
  `- confirmation required for dangerous actions: ${settings.trading.confirmations.requireUserConfirmationForDangerousActions ? "yes" : "no"}`,
  `- enabled cluster: ${settings.network.cluster}`,
  `- runtime write tools in operator lane: no`,
].join("\n");

const renderOperatorToolList = (
  snapshot: RuntimeCapabilitySnapshot | undefined,
  toolNames: string[],
): string => {
  type ToolEntry = RuntimeCapabilitySnapshot["modelTools"][number];
  const toolEntries = toolNames
    .map((toolName) => snapshot?.modelTools.find((toolEntry) => toolEntry.name === toolName))
    .filter((toolEntry): toolEntry is ToolEntry => toolEntry !== undefined);

  return [
    "## Enabled Operator Tools",
    `- exact allowlist: ${toolNames.map((toolName) => `\`${toolName}\``).join(", ") || "none"}`,
    ...toolEntries.map((toolEntry) => `- ${toolEntry.name}: ${toolEntry.routingHint}`),
    "- for wallet holdings and token balances, prefer `getManagedWalletContents` first",
    "- for SOL-only balance summaries, prefer `getManagedWalletSolBalances`",
    "- for Dexscreener market questions, use the Dexscreener read actions directly",
    "- start with discovery only when the user has not given a token or pair",
    "- when you need concrete metrics, use `getDexscreenerPairByChainAndPairId`, `getDexscreenerTokenPairsByChain`, or `getDexscreenerTokensByChain` and answer from returned liquidity, volume, and price-change fields",
    "- do not use workspace tools in operator chat",
  ].join("\n");
};

export const buildOperatorChatPrompt = async (input: {
  settings: RuntimeSettings;
  capabilitySnapshot?: RuntimeCapabilitySnapshot;
  toolNames: string[];
}): Promise<string> => {
  const rawWalletSummary = await renderRuntimeWalletPromptSummary();
  const walletSummary = truncate(rawWalletSummary, WALLET_SUMMARY_CHAR_LIMIT);

  const prompt = [
    OPERATOR_KERNEL_PROMPT,
    renderOperatorProfileSummary(input.settings),
    renderOperatorToolList(input.capabilitySnapshot, input.toolNames),
    "## Wallet Summary",
    walletSummary,
    [
      "## Operator Routing",
      "- for direct runtime questions, answer from a single runtime action when possible",
      "- for direct market questions, use Dexscreener runtime actions first and ask a short clarification only if the token set or market scope is genuinely ambiguous",
      "- skip greetings and capability preambles for direct asks",
      "- if one tool call answered the question, summarize the result and stop",
      "- if a runtime action fails, report the exact failure and the next corrective action",
    ].join("\n"),
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");

  return truncate(prompt, PROMPT_CHAR_LIMIT);
};
