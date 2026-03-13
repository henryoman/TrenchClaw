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
