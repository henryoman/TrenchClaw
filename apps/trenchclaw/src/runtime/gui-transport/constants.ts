import path from "node:path";
import type { GuiPublicRpcOptionView, GuiSecretOptionView } from "@trenchclaw/types";
import {
  RUNTIME_INSTANCE_ROOT,
  RUNTIME_NO_READ_ROOT,
  resolveCoreRelativePath,
} from "../runtime-paths";

export const MAX_ACTIVITY_ITEMS = 250;
export const GUI_QUEUE_INCLUDE_HISTORY = process.env.GUI_QUEUE_INCLUDE_HISTORY === "1";
export const ACTIVE_JOB_STATUSES = new Set(["pending", "running", "paused"]);
export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,accept",
};
export const INSTANCE_DIRECTORY = RUNTIME_INSTANCE_ROOT;
export const NO_READ_DIRECTORY = RUNTIME_NO_READ_ROOT;
export const AI_SETTINGS_FILE_PATH = path.join(NO_READ_DIRECTORY, "ai.json");
export const AI_SETTINGS_TEMPLATE_FILE_PATH = resolveCoreRelativePath("src/ai/config/ai.template.json");
export const VAULT_TEMPLATE_FILE_PATH = resolveCoreRelativePath("src/ai/config/vault.template.json");
export const DISPATCH_TEST_DEFAULT_WAIT_MS = 4000;
export const DISPATCH_TEST_MAX_WAIT_MS = 20000;

export const PUBLIC_RPC_OPTIONS: GuiPublicRpcOptionView[] = [
  { id: "solana-mainnet-beta", label: "Solana Mainnet (public)", url: "https://api.mainnet-beta.solana.com" },
  { id: "solana-devnet", label: "Solana Devnet (public)", url: "https://api.devnet.solana.com" },
];

export const SECRET_OPTIONS: GuiSecretOptionView[] = [
  {
    id: "solana-rpc-url",
    category: "blockchain",
    label: "Solana RPC URL",
    vaultPath: "rpc/default/http-url",
    placeholder: "https://your-rpc-provider.example",
    supportsPublicRpc: true,
  },
  {
    id: "helius-http-url",
    category: "blockchain",
    label: "Helius RPC HTTP URL",
    vaultPath: "rpc/helius/http-url",
    placeholder: "https://beta.helius-rpc.com/?api-key=...",
    supportsPublicRpc: false,
  },
  {
    id: "helius-ws-url",
    category: "blockchain",
    label: "Helius RPC WS URL",
    vaultPath: "rpc/helius/ws-url",
    placeholder: "wss://mainnet.helius-rpc.com/?api-key=...",
    supportsPublicRpc: false,
  },
  {
    id: "helius-api-key",
    category: "blockchain",
    label: "Helius API Key",
    vaultPath: "rpc/helius/api-key",
    placeholder: "Enter Helius API key",
    supportsPublicRpc: false,
  },
  {
    id: "quicknode-http-url",
    category: "blockchain",
    label: "QuickNode RPC HTTP URL",
    vaultPath: "rpc/quicknode/http-url",
    placeholder: "https://your-quicknode-endpoint.quiknode.pro/...",
    supportsPublicRpc: false,
  },
  {
    id: "quicknode-ws-url",
    category: "blockchain",
    label: "QuickNode RPC WS URL",
    vaultPath: "rpc/quicknode/ws-url",
    placeholder: "wss://your-quicknode-endpoint.quiknode.pro/...",
    supportsPublicRpc: false,
  },
  {
    id: "quicknode-api-key",
    category: "blockchain",
    label: "QuickNode API Key",
    vaultPath: "rpc/quicknode/api-key",
    placeholder: "Enter QuickNode API key",
    supportsPublicRpc: false,
  },
  {
    id: "solana-vibestation-api-key",
    category: "blockchain",
    label: "Solana Vibe Station API Key",
    vaultPath: "rpc/solana-vibestation/api-key",
    placeholder: "Enter Solana Vibe Station API key",
    supportsPublicRpc: false,
  },
  {
    id: "chainstack-api-key",
    category: "blockchain",
    label: "Chainstack API Key",
    vaultPath: "rpc/chainstack/api-key",
    placeholder: "Enter Chainstack API key",
    supportsPublicRpc: false,
  },
  {
    id: "temporal-api-key",
    category: "blockchain",
    label: "Temporal API Key",
    vaultPath: "rpc/temporal/api-key",
    placeholder: "Enter Temporal API key",
    supportsPublicRpc: false,
  },
  {
    id: "jupiter-api-key",
    category: "blockchain",
    label: "Jupiter Ultra API Key",
    vaultPath: "integrations/jupiter/api-key",
    placeholder: "Enter Jupiter Ultra API key",
    supportsPublicRpc: false,
  },
  {
    id: "ultra-signer-private-key",
    category: "blockchain",
    label: "Ultra Signer Private Key",
    vaultPath: "wallet/ultra-signer/private-key",
    placeholder: "Paste the signer private key",
    supportsPublicRpc: false,
  },
  {
    id: "ultra-signer-private-key-encoding",
    category: "blockchain",
    label: "Ultra Signer Key Encoding",
    vaultPath: "wallet/ultra-signer/private-key-encoding",
    placeholder: "base64 | hex | bytes",
    supportsPublicRpc: false,
  },
  {
    id: "openrouter-api-key",
    category: "ai",
    label: "OpenRouter API Key",
    vaultPath: "llm/openrouter/api-key",
    placeholder: "Enter OpenRouter API key",
    supportsPublicRpc: false,
  },
  {
    id: "vercel-ai-gateway-api-key",
    category: "ai",
    label: "Vercel AI Gateway API Key",
    vaultPath: "llm/gateway/api-key",
    placeholder: "Enter Vercel AI Gateway key",
    supportsPublicRpc: false,
  },
  {
    id: "openai-api-key",
    category: "ai",
    label: "OpenAI API Key",
    vaultPath: "llm/openai/api-key",
    placeholder: "Enter OpenAI API key",
    supportsPublicRpc: false,
  },
  {
    id: "anthropic-api-key",
    category: "ai",
    label: "Anthropic API Key",
    vaultPath: "llm/anthropic/api-key",
    placeholder: "Enter Anthropic API key",
    supportsPublicRpc: false,
  },
  {
    id: "google-ai-api-key",
    category: "ai",
    label: "Google AI API Key",
    vaultPath: "llm/google/api-key",
    placeholder: "Enter Google AI API key",
    supportsPublicRpc: false,
  },
  {
    id: "openai-compatible-api-key",
    category: "ai",
    label: "OpenAI-Compatible API Key",
    vaultPath: "llm/openai-compatible/api-key",
    placeholder: "Enter provider API key",
    supportsPublicRpc: false,
  },
];
