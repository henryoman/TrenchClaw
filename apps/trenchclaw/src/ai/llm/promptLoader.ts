import { fileURLToPath } from "node:url";
import { resolveCurrentActiveInstanceIdSync } from "../../runtime/instance/state";
import { loadRuntimeSettings } from "../../runtime/settings";
import { getRuntimeCapabilitySnapshot } from "../../tools/snapshot";
import { loadRuntimePromptSections } from "../../runtime/prompt/composer";
import { summarizeFilesystemPolicy } from "../../runtime/security/filesystemManifest";
import { resolveVaultFile } from "./vaultFile";

const SYSTEM_PROMPT_FILE = "../brain/config/prompts/system.md";
const PRIMARY_MODE_PROMPT_FILE = "../brain/config/prompts/primary.md";
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
    Bun.which("dune") ? "`dune`" : null,
  ].filter((value): value is string => value !== null);

  return [
    "### Shell Tooling",
    "- Call each tool with one JSON object that matches its registered schema.",
    "- `workspaceListDirectory` is the default browse tool for runtime workspace files and folders.",
    "- `workspaceBash` is for actual shell or CLI work after you know the path or command you need.",
    "- Always call `workspaceBash` with a top-level `type` such as `\"cli\"`, `\"version\"`, `\"help\"`, `\"which\"`, `\"search_text\"`, `\"list_directory\"`, `\"http_get\"`, or `\"shell\"` with `command`.",
    "- If no typed runtime action covers the needed read and a bounded trusted CLI command can answer it, prefer `workspaceBash` over refusing the task.",
    "- `workspaceBash` is a policy-constrained host shell today. Network-capable commands like `curl` or `type = \"http_get\"` can work when the host has network access, but this is still not the preferred runtime for arbitrary model-driven bash or host `bun run *.ts`.",
    "- Treat CLI tools like `solana`, `solana-keygen`, `helius`, and `dune` as things to invoke through `workspaceBash` rather than through any hidden side channel.",
    "- If you need command syntax, auth flow, or workflow details first, retrieve the matching knowledge doc or skill, then execute the command through `workspaceBash`.",
    `- detected CLI commands on PATH: ${detectedCommands.join(", ") || "none detected"}`,
  ].join("\n");
};

const renderLiveRuntimeRules = async (): Promise<string> => {
  const settings = await loadRuntimeSettings();
  const [filesystemPolicy, capabilitySnapshot] = await Promise.all([
    summarizeFilesystemPolicy({ actor: "agent", maxPathsPerBucket: 8 }),
    getRuntimeCapabilitySnapshot(settings),
  ]);
  const promptSections = await loadRuntimePromptSections({
    toolEntries: capabilitySnapshot.modelTools,
    includeWorkspaceDirectoryMap: true,
  });
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  const vault = resolveVaultFile({ activeInstanceId });
  const confirmationEnabled = settings.trading.confirmations.requireUserConfirmationForDangerousActions;

  return [
    "## Live Runtime Rules",
    `- active profile: ${settings.profile}`,
    `- profile meaning: ${renderProfileMeaning(settings.profile)}`,
    `- active instance: ${activeInstanceId ?? "none"}`,
    `- vault path: ${vault.vaultPath ?? "none"}`,
    `- dangerous-action confirmation: ${confirmationEnabled ? `required with token \`${settings.trading.confirmations.userConfirmationToken}\`` : "not required in the current profile"}`,
    `- enabled cluster: ${settings.network.cluster}`,
    "",
    "## Filesystem Summary",
    `- default permission: ${filesystemPolicy.defaultPermission}`,
    `- readable roots: ${filesystemPolicy.readPaths.join(", ") || "none"}`,
    `- writable roots: ${filesystemPolicy.writePaths.join(", ") || "none"}`,
    `- blocked roots: ${filesystemPolicy.blockedPaths.join(", ") || "none"}`,
    "- workspace tools are still restricted to the runtime workspace root, and direct reads of protected vault/keypair files are blocked",
    "",
    renderShellToolingSummary(),
    "",
    promptSections.commandMenuSection,
    "",
    promptSections.workspaceDirectoryMapSection,
    "",
    promptSections.asyncToolBehaviorSection,
    "",
    promptSections.liveRuntimeContext,
    "",
    promptSections.knowledgeSummary,
    "",
    "Registered tools for this request are attached separately. Treat those tool definitions as the exact contract.",
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
