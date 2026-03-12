import {
  readManagedWalletLibraryEntries,
  resolveReadableWalletLibraryFilePath,
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

  const walletLibraryFilePath = input.walletLibraryFilePath ?? await resolveReadableWalletLibraryFilePath();
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

  const { entries, invalidLineCount } = await readManagedWalletLibraryEntries({ filePath: walletLibraryFilePath });
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
    "These wallet variables are auto-loaded from the active instance wallet library at request time. Treat them as prompt-time convenience variables and copy the literal values into tool inputs when needed.",
    "",
    `- ACTIVE_INSTANCE_ID=${activeInstanceId}`,
    `- WALLET_LIBRARY_FILE=${walletLibraryContractPath}`,
    `- WALLET_COUNT=${entries.length}`,
    `- WALLET_GROUPS=${groups.join(", ") || "(none)"}`,
    `- WALLET_INVALID_LIBRARY_LINES=${invalidLineCount}`,
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
    "",
    "#### createWallets JSON Shape",
    "```json",
    JSON.stringify(
      {
        groups: [
          {
            walletGroup: "core-wallets",
            count: 3,
          },
          {
            walletGroup: "snipers",
            walletNames: ["wallet_alpha", "wallet_beta"],
          },
        ],
      },
      null,
      2,
    ),
    "```",
    "If `walletNames` is omitted for a group, names default to `wallet_000`, `wallet_001`, `wallet_002`, and so on.",
    "",
    "#### renameWallets JSON Shape",
    "```json",
    JSON.stringify(
      {
        edits: [
          {
            current: {
              walletGroup: "old-group",
              walletName: "old-name",
            },
            next: {
              walletGroup: "new-group",
              walletName: "new-name",
            },
          },
        ],
        updateLabelFiles: true,
      },
      null,
      2,
    ),
    "```",
    "This updates protected wallet metadata only. It does not delete wallets and does not change secret key bytes.",
  );

  if (orderedEntries.length === 0) {
    lines.push("- WALLET_LIBRARY_STATUS=empty");
    return lines.join("\n");
  }

  if (orderedEntries.length > visibleEntries.length) {
    lines.push(`- WALLET_PROMPT_TRUNCATED=yes (${visibleEntries.length}/${orderedEntries.length} wallets shown)`);
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
