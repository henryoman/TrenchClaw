import {
  readManagedWalletLibraryEntries,
  resolveWalletLibraryFilePath,
} from "../solana/lib/wallet/wallet-manager";
import {
  DEFAULT_WALLET_LIBRARY_FILE_NAME,
  type ManagedWalletLibraryEntry,
} from "../solana/lib/wallet/wallet-types";
import { resolveCurrentActiveInstanceIdSync } from "./instance-state";
import { toRuntimeContractRelativePath } from "./runtime-paths";

type WalletPromptEntry = ManagedWalletLibraryEntry;

interface RenderRuntimeWalletPromptContextInput {
  activeInstanceId?: string | null;
  walletLibraryFilePath?: string;
  maxWallets?: number;
}

const DEFAULT_MAX_PROMPT_WALLETS = 32;

const toVariableSegment = (value: string): string => {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();
  return normalized.length > 0 ? normalized : "UNNAMED";
};

const toWalletAlias = (entry: WalletPromptEntry): string =>
  `${toVariableSegment(entry.walletGroup)}__${toVariableSegment(entry.walletName)}`;

const toContractPath = (targetPath: string | undefined): string | null => {
  if (!targetPath) {
    return null;
  }
  return toRuntimeContractRelativePath(targetPath);
};

export const renderRuntimeWalletPromptContext = async (
  input: RenderRuntimeWalletPromptContextInput = {},
): Promise<string> => {
  const activeInstanceId = input.activeInstanceId ?? resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    return `## Wallet Runtime Variables
No active wallet instance is selected, so no wallet variables are loaded for this turn.`;
  }

  const walletLibraryFilePath = input.walletLibraryFilePath ?? resolveWalletLibraryFilePath();
  const walletLibraryContractPath = toRuntimeContractRelativePath(walletLibraryFilePath);
  const walletLibraryFile = Bun.file(walletLibraryFilePath);
  if (!(await walletLibraryFile.exists())) {
    return `## Wallet Runtime Variables
These wallet variables are loaded from the active instance wallet library at request time.

- ACTIVE_INSTANCE_ID=${activeInstanceId}
- WALLET_LIBRARY_FILE=${walletLibraryContractPath}
- WALLET_LIBRARY_STATUS=missing
- WALLET_LIBRARY_EXPECTED_FILE_NAME=${DEFAULT_WALLET_LIBRARY_FILE_NAME}

If the user asks for the current balance, holdings, or total money in "our wallets", interpret that as the managed wallets for this active instance.
When WALLET_LIBRARY_STATUS=missing, answer directly that no managed wallets are configured right now, so the tracked managed-wallet total is zero.
Do not ask follow-up questions before giving that direct answer unless the user explicitly asks to add, import, or inspect external wallets.`;
  }

  const { entries, invalidLineCount } = await readManagedWalletLibraryEntries({
    filePath: walletLibraryFilePath,
  });
  const maxWallets = Math.max(1, Math.trunc(input.maxWallets ?? DEFAULT_MAX_PROMPT_WALLETS));
  const orderedEntries = [...entries].toSorted((left, right) =>
    `${left.walletGroup}.${left.walletName}`.localeCompare(`${right.walletGroup}.${right.walletName}`));
  const visibleEntries = orderedEntries.slice(0, maxWallets);
  const groups = [...new Set(orderedEntries.map((entry) => entry.walletGroup))];

  const walletJson = visibleEntries.map((entry) => ({
    alias: toWalletAlias(entry),
    walletId: entry.walletId,
    walletGroup: entry.walletGroup,
    walletName: entry.walletName,
    address: entry.address,
    keypairFile: toContractPath(entry.keypairFilePath),
    walletLabelFile: toContractPath(entry.walletLabelFilePath),
  }));

  const lines = [
    "## Wallet Runtime Variables",
    "These wallet variables are auto-loaded from the active instance wallet library at request time.",
    "",
    `- ACTIVE_INSTANCE_ID=${activeInstanceId}`,
    `- WALLET_LIBRARY_FILE=${walletLibraryContractPath}`,
    `- WALLET_COUNT=${entries.length}`,
    `- WALLET_GROUPS=${groups.join(", ") || "(none)"}`,
    `- WALLET_INVALID_LIBRARY_LINES=${invalidLineCount}`,
    "- For questions about full holdings or token balances of managed wallets, call `getManagedWalletContents` instead of using workspaceBash.",
    "- For SOL-only balance summaries of managed wallets, call `getManagedWalletSolBalances`.",
  ];

  lines.push(
    "",
    "### Allowed Wallet Organization Writes",
    "- Use `createWallets` to create new wallets.",
    "- Use `renameWallets` to update wallet organization labels only.",
    "- `renameWallets` requires explicit `current` and `next` values for each wallet edit.",
    "- Never use direct file tools to edit `wallet-library.jsonl` or `*.label.json` wallet files.",
    "- There is no wallet delete tool in chat.",
    "- Wallet groups must be flat single-level names only.",
    "- Each wallet group can create at most 100 wallets per call.",
    "- If `walletNames` is omitted for a group, names default to `000`, `001`, `002`, and so on.",
    "This updates protected wallet metadata only. It does not delete wallets and does not change secret key bytes.",
  );

  if (orderedEntries.length === 0) {
    lines.push("- WALLET_LIBRARY_STATUS=empty");
    lines.push("");
    lines.push("If the user asks for the current balance, holdings, or total money in \"our wallets\", interpret that as the managed wallets for this active instance.");
    lines.push("When WALLET_LIBRARY_STATUS=empty, answer directly that there are no managed wallets configured yet, so the tracked managed-wallet total is zero.");
    lines.push("Do not ask follow-up questions before giving that direct answer unless the user explicitly asks to add, import, or inspect external wallets.");
    return lines.join("\n");
  }

  if (orderedEntries.length > visibleEntries.length) {
    lines.push(`- WALLET_PROMPT_TRUNCATED=yes (${visibleEntries.length}/${orderedEntries.length} wallets shown)`);
  }

  lines.push(
    "",
    "### Wallet Alias Variables",
    "- For single-wallet mutation tools like `transfer`, `closeTokenAccount`, and `managedUltraSwap`, prefer passing `wallet` as the wallet name string when it is unique in this active instance.",
    "- For multi-wallet read tools like `getManagedWalletContents` and `getManagedWalletSolBalances`, prefer passing `wallets` as an array of wallet name strings when the names are unique in this active instance.",
    "- If a wallet name is ambiguous across groups, pass `wallet` as an object like `{ \"group\": \"core-wallets\", \"name\": \"maker-1\" }`.",
    "- If multiple wallet names are ambiguous across groups, pass `wallets` as objects like `{ \"group\": \"core-wallets\", \"name\": \"maker-1\" }`.",
    "- Do not pass RPC provider details to wallet tools. Runtime action context resolves RPC and rate limiting automatically.",
  );

  for (const entry of visibleEntries) {
    const alias = toWalletAlias(entry);
    lines.push(`- WALLET__${alias}__ID=${entry.walletId}`);
    lines.push(`- WALLET__${alias}__GROUP=${entry.walletGroup}`);
    lines.push(`- WALLET__${alias}__NAME=${entry.walletName}`);
    lines.push(`- WALLET__${alias}__ADDRESS=${entry.address}`);
    const keypairFile = toContractPath(entry.keypairFilePath);
    if (keypairFile) {
      lines.push(`- WALLET__${alias}__KEYPAIR_FILE=${keypairFile}`);
    }
    const walletLabelFile = toContractPath(entry.walletLabelFilePath);
    if (walletLabelFile) {
      lines.push(`- WALLET__${alias}__LABEL_FILE=${walletLabelFile}`);
    }
  }

  lines.push(
    "",
    "### Wallet JSON",
    "```json",
    JSON.stringify(
      {
        activeInstanceId,
        walletLibraryFile: walletLibraryContractPath,
        walletCount: orderedEntries.length,
        walletGroups: groups,
        wallets: walletJson,
      },
      null,
      2,
    ),
    "```",
  );

  return lines.join("\n");
};

export const renderRuntimeWalletPromptSummary = async (
  input: RenderRuntimeWalletPromptContextInput = {},
): Promise<string> => {
  const activeInstanceId = input.activeInstanceId ?? resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    return [
      "- active instance wallet scope: none",
      "- managed wallet status: no active instance selected",
      "- prefer `queryRuntimeStore`, `getManagedWalletContents`, or `getManagedWalletSolBalances` for wallet state questions",
    ].join("\n");
  }

  const walletLibraryFilePath = input.walletLibraryFilePath ?? resolveWalletLibraryFilePath();
  const walletLibraryContractPath = toRuntimeContractRelativePath(walletLibraryFilePath);
  const walletLibraryFile = Bun.file(walletLibraryFilePath);
  if (!(await walletLibraryFile.exists())) {
    return [
      `- active instance wallet scope: ${activeInstanceId}`,
      `- wallet library file: ${walletLibraryContractPath}`,
      `- managed wallet status: missing library file (${DEFAULT_WALLET_LIBRARY_FILE_NAME})`,
      "- use `getManagedWalletContents` for holdings and token balances",
      "- `getManagedWalletContents` prefers Helius DAS when Helius is the selected private RPC",
      "- use `getManagedWalletSolBalances` for SOL-only balance summaries",
      "- never read or edit vaults, keypairs, or wallet-library files directly with file tools",
    ].join("\n");
  }

  const { entries, invalidLineCount } = await readManagedWalletLibraryEntries({
    filePath: walletLibraryFilePath,
  });
  const groups = [...new Set(entries.map((entry) => entry.walletGroup))];
  const previewWallets = [...entries]
    .toSorted((left, right) => `${left.walletGroup}.${left.walletName}`.localeCompare(`${right.walletGroup}.${right.walletName}`))
    .slice(0, 5)
    .map((entry) => `${entry.walletGroup}/${entry.walletName}=${entry.address}`);

  return [
    `- active instance wallet scope: ${activeInstanceId}`,
    `- wallet library file: ${walletLibraryContractPath}`,
    `- managed wallet count: ${entries.length}`,
    `- wallet groups: ${groups.join(", ") || "(none)"}`,
    `- invalid library lines: ${invalidLineCount}`,
    `- wallet preview: ${previewWallets.join("; ") || "none"}`,
    "- use `createWallets` for wallet creation and `renameWallets` for label changes",
    "- use `getManagedWalletContents` for holdings and token balances",
    "- `getManagedWalletContents` prefers Helius DAS when Helius is the selected private RPC",
    "- use `getManagedWalletSolBalances` for SOL-only balance summaries",
    "- never read or edit vaults, keypairs, or wallet-library files directly with file tools",
  ].join("\n");
};
