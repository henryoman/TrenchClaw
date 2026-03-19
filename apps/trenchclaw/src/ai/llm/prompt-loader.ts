import { fileURLToPath } from "node:url";
import {
  getRuntimeCapabilitySnapshot,
  renderRuntimeReleaseReadinessSection,
  renderRuntimeToolContractSection,
} from "../../runtime/capabilities";
import { resolveCurrentActiveInstanceIdSync } from "../../runtime/instance-state";
import { loadRuntimeSettings } from "../../runtime/load";
import { summarizeFilesystemPolicy } from "../../runtime/security/filesystem-manifest";
import { renderRuntimeWalletPromptSummary } from "../../runtime/wallet-model-context";
import { renderLiveRuntimeContextSection } from "../../runtime/prompt/live-context";
import { resolveVaultFile } from "./vault-file";

const SYSTEM_PROMPT_FILE = "../config/system.md";
const AGENT_MODE_ENV = "TRENCHCLAW_AGENT_MODE";
const SUPPORTED_MODE = "primary";

const FALLBACK_SYSTEM_PROMPT = [
  "You are TrenchClaw, a safety-first Solana runtime assistant.",
  "Prioritize policy compliance, capital protection, and clear user communication.",
].join(" ");

export interface SystemPromptPayload {
  mode: string;
  title: string;
  systemPrompt: string;
  promptFiles: string[];
  sections: Array<{
    order: number;
    title: string;
    kind: "file" | "generated";
    source: string;
  }>;
}

const cachedPromptFiles = new Map<string, string>();

const resolvePromptFilePath = (relativePath: string): string => fileURLToPath(new URL(relativePath, import.meta.url));

const loadPromptFile = async (
  relativePath: string,
  fallbackText?: string,
): Promise<{ path: string; text: string }> => {
  const filePath = resolvePromptFilePath(relativePath);
  const cachedText = cachedPromptFiles.get(filePath);
  if (cachedText) {
    return { path: filePath, text: cachedText };
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    const text = fallbackText?.trim() || "";
    cachedPromptFiles.set(filePath, text);
    return { path: filePath, text };
  }

  const text = ((await file.text()).trim() || fallbackText || "").trim();
  cachedPromptFiles.set(filePath, text);
  return { path: filePath, text };
};

const resolveMode = (requestedMode: string | undefined): string => {
  const normalized = requestedMode?.trim() || SUPPORTED_MODE;
  if (normalized !== SUPPORTED_MODE) {
    throw new Error(`Unknown agent mode "${normalized}". Only "${SUPPORTED_MODE}" is supported.`);
  }
  return normalized;
};

const renderProfileMeaning = (profile: string): string => {
  switch (profile) {
    case "safe":
      return "read-first operation, no direct model file writes, and dangerous actions remain constrained.";
    case "dangerous":
      return "mutating runtime actions are available for testing, and extra confirmation only applies if live settings explicitly turn it back on.";
    case "veryDangerous":
      return "more execution paths are enabled, but runtime policy and confirmation checks still apply where configured.";
    default:
      return "follow the live runtime settings and do not assume looser access than what is stated here.";
  }
};

const renderRuntimeContract = async (): Promise<string> => {
  const settings = await loadRuntimeSettings();
  const [capabilitySnapshot, filesystemPolicy, walletSummary, liveRuntimeContext] = await Promise.all([
    getRuntimeCapabilitySnapshot(settings),
    summarizeFilesystemPolicy({ actor: "agent", maxPathsPerBucket: 8 }),
    renderRuntimeWalletPromptSummary(),
    renderLiveRuntimeContextSection(),
  ]);
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  const vault = resolveVaultFile({ activeInstanceId });
  const confirmationEnabled = settings.trading.confirmations.requireUserConfirmationForDangerousActions;

  return [
    "## Runtime Contract",
    `- active profile: ${settings.profile}`,
    `- profile meaning: ${renderProfileMeaning(settings.profile)}`,
    `- active instance: ${activeInstanceId ?? "none"}`,
    `- vault path: ${vault.vaultPath ?? "none"}`,
    "",
    "### Confirmation Policy",
    confirmationEnabled
      ? `- dangerous actions can require explicit confirmation using the runtime token \`${settings.trading.confirmations.userConfirmationToken}\` or an equivalent confirmed flag`
      : "- no extra runtime confirmation token is required for dangerous actions in the current profile",
    "",
    "### Filesystem Summary",
    `- default permission: ${filesystemPolicy.defaultPermission}`,
    `- readable roots: ${filesystemPolicy.readPaths.join(", ") || "none"}`,
    `- writable roots: ${filesystemPolicy.writePaths.join(", ") || "none"}`,
    `- blocked roots: ${filesystemPolicy.blockedPaths.join(", ") || "none"}`,
    "",
    renderRuntimeToolContractSection(capabilitySnapshot),
    "",
    renderRuntimeReleaseReadinessSection(capabilitySnapshot),
    "",
    liveRuntimeContext,
    "",
    "## Wallet Summary",
    walletSummary,
    "",
    "## Key Paths",
    "- `src/runtime/bootstrap.ts`",
    "- `src/runtime/chat.ts`",
    "- `src/runtime/capabilities/`",
    "- `src/ai/config/system.md`",
    "- `.trenchclaw-generated/knowledge-index.md`",
    "- `.trenchclaw-generated/workspace-context.md`",
    "",
    "Use `workspaceReadFile` only for exact runtime-workspace reads when you know the path.",
    "Use `queryRuntimeStore` and `queryInstanceMemory` for structured runtime state instead of reading files when a structured action exists.",
  ].join("\n");
};

export const loadSystemPromptPayload = async (mode = process.env[AGENT_MODE_ENV]): Promise<SystemPromptPayload> => {
  const resolvedMode = resolveMode(mode);
  const [kernel, runtimeContract] = await Promise.all([
    loadPromptFile(SYSTEM_PROMPT_FILE, FALLBACK_SYSTEM_PROMPT),
    renderRuntimeContract(),
  ]);

  const systemPrompt = [kernel.text, runtimeContract].filter((value) => value.trim().length > 0).join("\n\n");

  return {
    mode: resolvedMode,
    title: "Primary Runtime Contract",
    systemPrompt,
    promptFiles: [kernel.path],
    sections: [
      {
        order: 1,
        title: "System Kernel",
        kind: "file",
        source: kernel.path,
      },
      {
        order: 2,
        title: "Runtime Contract",
        kind: "generated",
        source: "generated:runtimeContract",
      },
    ],
  };
};

export const loadDefaultSystemPrompt = async (): Promise<string> => {
  const payload = await loadSystemPromptPayload(process.env[AGENT_MODE_ENV]);
  return payload.systemPrompt;
};

export const resetPromptLoaderCache = (): void => {
  cachedPromptFiles.clear();
};
