import { fileURLToPath } from "node:url";

import type { RuntimeCapabilitySnapshot } from "../../runtime/capabilities";
import type { RuntimeSettings } from "../../runtime/load";
import { renderRuntimeWalletPromptSummary } from "../../runtime/wallet-model-context";

const SYSTEM_PROMPT_FILE = "../config/system.md";
const PROMPT_CHAR_LIMIT = 8_000;
const WALLET_SUMMARY_CHAR_LIMIT = 1_200;

let cachedKernelPrompt: string | null = null;

const truncate = (value: string, limit: number): string =>
  value.length > limit ? `${value.slice(0, Math.max(0, limit - 14))}\n...[truncated]` : value;

const resolvePromptFilePath = (relativePath: string): string => fileURLToPath(new URL(relativePath, import.meta.url));

const loadKernelPrompt = async (): Promise<string> => {
  if (cachedKernelPrompt !== null) {
    return cachedKernelPrompt;
  }
  const file = Bun.file(resolvePromptFilePath(SYSTEM_PROMPT_FILE));
  cachedKernelPrompt = (await file.text()).trim();
  return cachedKernelPrompt;
};

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
  const toolEntries = toolNames
    .map((toolName) => snapshot?.modelTools.find((toolEntry) => toolEntry.name === toolName))
    .filter((toolEntry): toolEntry is NonNullable<typeof toolEntries[number]> => toolEntry !== undefined);

  return [
    "## Enabled Operator Tools",
    `- exact allowlist: ${toolNames.map((toolName) => `\`${toolName}\``).join(", ") || "none"}`,
    ...toolEntries.map((toolEntry) => `- ${toolEntry.name}: ${toolEntry.routingHint}`),
    "- for wallet holdings and token balances, prefer `getManagedWalletContents` first",
    "- for SOL-only balance summaries, prefer `getManagedWalletSolBalances`",
    "- do not use workspace tools in operator chat",
  ].join("\n");
};

export const buildOperatorChatPrompt = async (input: {
  settings: RuntimeSettings;
  capabilitySnapshot?: RuntimeCapabilitySnapshot;
  toolNames: string[];
}): Promise<string> => {
  const [kernelPrompt, rawWalletSummary] = await Promise.all([
    loadKernelPrompt(),
    renderRuntimeWalletPromptSummary(),
  ]);
  const walletSummary = truncate(rawWalletSummary, WALLET_SUMMARY_CHAR_LIMIT);

  const prompt = [
    kernelPrompt,
    renderOperatorProfileSummary(input.settings),
    renderOperatorToolList(input.capabilitySnapshot, input.toolNames),
    "## Wallet Summary",
    walletSummary,
    [
      "## Operator Routing",
      "- for direct runtime questions, answer from a single runtime action when possible",
      "- skip greetings and capability preambles for direct asks",
      "- if one tool call answered the question, summarize the result and stop",
      "- if a runtime action fails, report the exact failure and the next corrective action",
    ].join("\n"),
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");

  return truncate(prompt, PROMPT_CHAR_LIMIT);
};
