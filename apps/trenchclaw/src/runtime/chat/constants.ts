import {
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
  resolveDefaultWorkspaceBashRoot,
} from "../workspace-bash";

export const toToolDescription = (actionName: string, category: string, subcategory?: string): string =>
  `Dispatch runtime action "${actionName}" (${category}${subcategory ? `/${subcategory}` : ""}).`;

export const CHAT_MODEL_STREAM_TIMEOUT = {
  totalMs: 45_000,
  stepMs: 25_000,
  chunkMs: 12_000,
} as const;

export const CHAT_MODEL_FALLBACK_GENERATE_TIMEOUT = {
  totalMs: 20_000,
  stepMs: 20_000,
} as const;

export const RUNTIME_WORKSPACE_TOOL_NAMES = [
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
] as const;

export const resolveWorkspaceRootDirectory = (workspaceRootDirectory?: string): string =>
  workspaceRootDirectory ?? resolveDefaultWorkspaceBashRoot();

export const WALLET_MUTATION_INTENT_TOKENS = [
  "transfer",
  "send",
  "move",
  "swap",
  "buy",
  "sell",
  "create",
  "rename",
  "close",
  "delete",
  "remove",
  "fund",
  "airdrop",
  "deposit",
  "withdraw",
  "import",
  "export",
] as const;

export const WALLET_INVENTORY_INTENT_PHRASES = [
  "what wallets do we have",
  "which wallets do we have",
  "list wallets",
  "show wallets",
  "wallet addresses",
  "wallet address",
  "wallet names",
  "wallet name",
] as const;

export const WALLET_CONTENTS_INTENT_PHRASES = [
  "what do we have",
  "what is in",
  "whats in",
  "what s in",
  "contents",
  "content",
  "hold",
  "holds",
  "holding",
  "holdings",
  "balance",
  "balances",
  "token",
  "tokens",
  "coin",
  "coins",
  "asset",
  "assets",
  "how much",
  "right now",
  "wallet update",
  "wallet status",
] as const;
