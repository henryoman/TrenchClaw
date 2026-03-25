import type {
  RuntimeApiPublicRpcOptionView,
  RuntimeApiRpcProviderOptionView,
  RuntimeApiSecretOptionView,
} from "@trenchclaw/types";

export const PUBLIC_RPC_OPTIONS: RuntimeApiPublicRpcOptionView[] = [
  { id: "solana-mainnet-beta", label: "Solana Mainnet (public)", url: "https://api.mainnet-beta.solana.com" },
  { id: "solana-devnet", label: "Solana Devnet (public)", url: "https://api.devnet.solana.com" },
];

export const RPC_PROVIDER_OPTIONS: RuntimeApiRpcProviderOptionView[] = [
  {
    id: "helius",
    label: "Helius",
    credentialLabel: "RPC Provider Key",
    placeholder: "Enter RPC provider key",
    mode: "api-key",
  },
  {
    id: "quicknode",
    label: "QuickNode",
    credentialLabel: "RPC endpoint URL",
    placeholder: "https://your-endpoint.solana-mainnet.quiknode.pro/...",
    mode: "endpoint-url",
  },
  {
    id: "shyft",
    label: "Shyft",
    credentialLabel: "RPC Provider Key",
    placeholder: "Enter RPC provider key",
    mode: "api-key",
  },
  {
    id: "chainstack",
    label: "Chainstack",
    credentialLabel: "RPC endpoint URL",
    placeholder: "https://your-chainstack-endpoint.example",
    mode: "endpoint-url",
  },
];

export const SECRET_OPTIONS: RuntimeApiSecretOptionView[] = [
  {
    id: "solana-rpc-url",
    category: "blockchain",
    label: "Private RPC credential",
    vaultPath: "rpc/default/http-url",
    placeholder: "Enter RPC credential",
    supportsPublicRpc: true,
  },
  {
    id: "jupiter-api-key",
    category: "blockchain",
    label: "Jupiter API key",
    vaultPath: "integrations/jupiter/api-key",
    placeholder: "portal.jup.ag — one key for Ultra + Swap API + Trigger (same field)",
    supportsPublicRpc: false,
  },
  {
    id: "dune-api-key",
    category: "blockchain",
    label: "Dune API key",
    vaultPath: "integrations/dune/api-key",
    placeholder: "Dune Analytics API key (dune.com → settings → API)",
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
];
