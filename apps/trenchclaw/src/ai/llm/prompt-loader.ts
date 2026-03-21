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
import { renderKnowledgeAliasMenu } from "../../lib/knowledge/knowledge-index";
import { resolveVaultFile } from "./vault-file";

const SYSTEM_PROMPT_FILE = "../config/system.md";
const PRIMARY_MODE_PROMPT_FILE = "../config/agent-modes/primary.md";
const KNOWLEDGE_ROOT = "../brain/knowledge/";
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

const renderShellToolingSummary = (): string => {
  const detectedCommands = [
    Bun.which("solana") ? "`solana`" : null,
    Bun.which("solana-keygen") ? "`solana-keygen`" : null,
    Bun.which("helius") ? "`helius`" : null,
  ].filter((value): value is string => value !== null);

  return [
    "### Shell Tooling",
    "- `workspaceListDirectory` is the default tool for browsing runtime workspace files and folders without using the shell.",
    "- `workspaceBash` runs in an instance-scoped shell with its own `HOME`, `TMPDIR`, and a `tool-bin`-first `PATH`.",
    `- detected CLI commands on PATH: ${detectedCommands.join(", ") || "none detected"}`,
    "- Use shell tools for real local investigation when needed, and verify CLI availability with `command -v <tool>` or `<tool> --version` before depending on it.",
  ].join("\n");
};

const renderLiveRuntimeRules = async (): Promise<string> => {
  const settings = await loadRuntimeSettings();
  const [capabilitySnapshot, filesystemPolicy, walletSummary, liveRuntimeContext, knowledgeMenu] = await Promise.all([
    getRuntimeCapabilitySnapshot(settings),
    summarizeFilesystemPolicy({ actor: "agent", maxPathsPerBucket: 8 }),
    renderRuntimeWalletPromptSummary(),
    renderLiveRuntimeContextSection(),
    renderKnowledgeAliasMenu(resolvePromptFilePath(KNOWLEDGE_ROOT)),
  ]);
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  const vault = resolveVaultFile({ activeInstanceId });
  const confirmationEnabled = settings.trading.confirmations.requireUserConfirmationForDangerousActions;

  return [
    "## Live Runtime Rules",
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
    "- workspace tools are still restricted to the runtime workspace root, and direct reads of protected vault/keypair files are blocked",
    "",
    renderShellToolingSummary(),
    "",
    renderRuntimeToolContractSection(capabilitySnapshot),
    "",
    renderRuntimeReleaseReadinessSection(capabilitySnapshot),
    "",
    liveRuntimeContext,
    "",
    knowledgeMenu,
    "",
    "## Wallet Summary",
    walletSummary,
    "",
    "## Key Paths",
    "- `src/runtime/bootstrap.ts`",
    "- `src/runtime/chat.ts`",
    "- `src/runtime/capabilities/`",
    "- `src/ai/config/system.md`",
    "- `.runtime-state/instances/<id>/cache/generated/knowledge-index.md`",
    "- `.runtime-state/instances/<id>/cache/generated/workspace-context.md`",
    "",
    "Use `listKnowledgeDocs` to browse knowledge aliases and `readKnowledgeDoc` to open one by alias.",
    "Prefer `readKnowledgeDoc` over guessing long knowledge file paths.",
    "Use `workspaceListDirectory` first when you need to browse the runtime workspace or discover exact file paths.",
    "Use `workspaceReadFile` only for exact runtime-workspace reads when you know the path.",
    "Use `workspaceWriteFile` only for exact runtime-workspace artifacts such as notes, scratch files, and generated output.",
    "Use `queryRuntimeStore` and `queryInstanceMemory` for structured runtime state instead of reading files when a structured action exists.",
  ].join("\n");
};

export const loadSystemPromptPayload = async (mode = process.env[AGENT_MODE_ENV]): Promise<SystemPromptPayload> => {
  const resolvedMode = resolveMode(mode);
  const [kernel, primaryMode, runtimeRules] = await Promise.all([
    loadPromptFile(SYSTEM_PROMPT_FILE, FALLBACK_SYSTEM_PROMPT),
    loadPromptFile(PRIMARY_MODE_PROMPT_FILE),
    renderLiveRuntimeRules(),
  ]);

  const systemPrompt = [kernel.text, primaryMode.text, runtimeRules].filter((value) => value.trim().length > 0).join("\n\n");

  return {
    mode: resolvedMode,
    title: "Primary Runtime Rules",
    systemPrompt,
    promptFiles: [kernel.path, primaryMode.path],
    sections: [
      {
        order: 1,
        title: "System Kernel",
        kind: "file",
        source: kernel.path,
      },
      {
        order: 2,
        title: "Primary Mode",
        kind: "file",
        source: primaryMode.path,
      },
      {
        order: 3,
        title: "Live Runtime Rules",
        kind: "generated",
        source: "generated:liveRuntimeRules",
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
