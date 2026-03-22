import type { RuntimeApiPublicRpcOptionView, RuntimeApiRpcProviderOptionView, RuntimeApiSecretOptionView } from "@trenchclaw/types";
import {
  RUNTIME_INSTANCE_ROOT,
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
    label: "Jupiter Ultra API Key",
    vaultPath: "integrations/jupiter/api-key",
    placeholder: "Enter Jupiter Ultra API key",
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
