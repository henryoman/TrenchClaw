import { DEFAULT_WALLET_LIBRARY_FILE_NAME, resolveWalletLibraryFilePath } from "../solana/actions/wallet-based/create-wallets/wallet-storage";
import { resolveCurrentActiveInstanceIdSync } from "./instance-state";
import { toRuntimeContractRelativePath } from "./runtime-paths";

interface WalletPromptEntry {
  walletId: string;
  walletGroup: string;
  walletName: string;
  address: string;
  keypairFilePath?: string;
  walletLabelFilePath?: string;
}

interface RenderRuntimeWalletPromptContextInput {
  activeInstanceId?: string | null;
  walletLibraryFilePath?: string;
  maxWallets?: number;
}

const DEFAULT_MAX_PROMPT_WALLETS = 32;

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

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

export const parseWalletPromptEntries = (rawText: string): {
  entries: WalletPromptEntry[];
  invalidLineCount: number;
} => {
  const latestEntryByWalletId = new Map<string, WalletPromptEntry>();
  let invalidLineCount = 0;

  for (const line of rawText.split("\n")) {
    const normalized = line.trim();
    if (!normalized) {
      continue;
    }

    try {
      const parsed = JSON.parse(normalized) as Record<string, unknown>;
      const walletId = asNonEmptyString(parsed.walletId);
      const walletGroup = asNonEmptyString(parsed.walletGroup);
      const walletName = asNonEmptyString(parsed.walletName);
      const address = asNonEmptyString(parsed.address);
      if (!walletId || !walletGroup || !walletName || !address) {
        invalidLineCount += 1;
        continue;
      }

      latestEntryByWalletId.set(walletId, {
        walletId,
        walletGroup,
        walletName,
        address,
        keypairFilePath: asNonEmptyString(parsed.keypairFilePath) ?? undefined,
        walletLabelFilePath: asNonEmptyString(parsed.walletLabelFilePath) ?? undefined,
      });
    } catch {
      invalidLineCount += 1;
    }
  }

  return {
    entries: [...latestEntryByWalletId.values()].toSorted((left, right) =>
      `${left.walletGroup}.${left.walletName}`.localeCompare(`${right.walletGroup}.${right.walletName}`),
    ),
    invalidLineCount,
  };
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
- WALLET_LIBRARY_EXPECTED_FILE_NAME=${DEFAULT_WALLET_LIBRARY_FILE_NAME}`;
  }

  const { entries, invalidLineCount } = parseWalletPromptEntries(await walletLibraryFile.text());
  const maxWallets = Math.max(1, Math.trunc(input.maxWallets ?? DEFAULT_MAX_PROMPT_WALLETS));
  const visibleEntries = entries.slice(0, maxWallets);
  const groups = [...new Set(entries.map((entry) => entry.walletGroup))];

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
    "These wallet variables are auto-loaded from the active instance wallet library at request time. Treat them as prompt-time convenience variables and copy the literal values into tool inputs when needed.",
    "",
    `- ACTIVE_INSTANCE_ID=${activeInstanceId}`,
    `- WALLET_LIBRARY_FILE=${walletLibraryContractPath}`,
    `- WALLET_COUNT=${entries.length}`,
    `- WALLET_GROUPS=${groups.join(", ") || "(none)"}`,
    `- WALLET_INVALID_LIBRARY_LINES=${invalidLineCount}`,
  ];

  if (entries.length === 0) {
    lines.push("- WALLET_LIBRARY_STATUS=empty");
    return lines.join("\n");
  }

  if (entries.length > visibleEntries.length) {
    lines.push(`- WALLET_PROMPT_TRUNCATED=yes (${visibleEntries.length}/${entries.length} wallets shown)`);
  }

  lines.push("", "### Wallet Alias Variables");

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
        walletCount: entries.length,
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
