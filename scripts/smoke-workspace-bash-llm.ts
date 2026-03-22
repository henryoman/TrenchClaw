#!/usr/bin/env bun
/**
 * End-to-end check: LLM + workspaceBash runs real CLIs (solana, helius) in HostWorkspaceSandbox.
 * LLM: uses vault (same as GUI), or `OPENROUTER_API_KEY` / `TRENCHCLAW_SMOKE_OPENROUTER_API_KEY` if vault has no key.
 * CLIs: must be findable via `Bun.which`; this script symlinks them into instance `01` tool-bin (same as normal PATH order).
 *
 * Usage (from repo root): bun run scripts/smoke-workspace-bash-llm.ts
 */
import { mkdir, readlink, symlink, unlink } from "node:fs/promises";
import path from "node:path";

import type { LanguageModel } from "ai";
import { generateText, stepCountIs } from "ai";

import { loadAiSettings } from "../apps/trenchclaw/src/ai/llm/ai-settings-file.ts";
import { resolveLlmRuntimeBinding } from "../apps/trenchclaw/src/ai/llm/client.ts";
import { createLanguageModel } from "../apps/trenchclaw/src/ai/llm/config.ts";
import { RUNTIME_INSTANCE_ROOT } from "../apps/trenchclaw/src/runtime/runtime-paths.ts";
import { resolveInstanceToolBinRoot } from "../apps/trenchclaw/src/runtime/instance-paths.ts";
import {
  WORKSPACE_BASH_TOOL_NAME,
  createWorkspaceBashTools,
} from "../apps/trenchclaw/src/runtime/workspace-bash.ts";

const INSTANCE_ID = "01";

const ensureToolBinSymlink = async (name: string, target: string): Promise<void> => {
  const toolBin = resolveInstanceToolBinRoot(INSTANCE_ID);
  await mkdir(toolBin, { recursive: true });
  const linkPath = path.join(toolBin, name);
  try {
    const existing = await readlink(linkPath);
    if (existing === target) {
      return;
    }
  } catch {
    // no link yet
  }
  try {
    await unlink(linkPath);
  } catch {
    // ignore
  }
  await symlink(target, linkPath);
};

const resolveSmokeLanguageModel = async (): Promise<LanguageModel> => {
  const fromVault = await resolveLlmRuntimeBinding();
  if (fromVault.languageModel) {
    return fromVault.languageModel;
  }

  const apiKey =
    process.env.TRENCHCLAW_SMOKE_OPENROUTER_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      [
        "No LLM credentials: instance vault has no llm/<provider>/api-key, and neither",
        "TRENCHCLAW_SMOKE_OPENROUTER_API_KEY nor OPENROUTER_API_KEY is set.",
        "Add a key in the GUI vault, or export OPENROUTER_API_KEY for this smoke script only.",
      ].join(" "),
    );
  }

  const { settings } = await loadAiSettings();
  if (settings.provider !== "openrouter") {
    throw new Error(
      `Smoke fallback only supports openrouter; instance ai.json has provider=${settings.provider}.`,
    );
  }

  return createLanguageModel({
    provider: "openrouter",
    apiKey,
    model: settings.model.trim(),
    baseURL: "https://openrouter.ai/api/v1",
  });
};

const main = async (): Promise<void> => {
  // Instance-scoped AI settings + vault (same as runtime server / GUI).
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = INSTANCE_ID;

  const solana = Bun.which("solana");
  const helius = Bun.which("helius");
  if (!solana || !helius) {
    throw new Error(
      `Need solana and helius on PATH for this smoke test. Found solana=${solana ?? "missing"}, helius=${helius ?? "missing"}`,
    );
  }
  await ensureToolBinSymlink("solana", solana);
  await ensureToolBinSymlink("helius", helius);

  const workspaceRoot = path.join(RUNTIME_INSTANCE_ROOT, INSTANCE_ID, "workspace", ".smoke-cli", crypto.randomUUID());
  await mkdir(workspaceRoot, { recursive: true });

  const tools = await createWorkspaceBashTools({
    workspaceRootDirectory: workspaceRoot,
    actor: "agent",
    commandTimeoutMs: 60_000,
  });

  const model = await resolveSmokeLanguageModel();

  const bashTool = tools[WORKSPACE_BASH_TOOL_NAME] as {
    description?: string;
    execute: (input: unknown) => Promise<unknown>;
  };

  const result = await generateText({
    model,
    system:
      "You are a CLI smoke test. You must call the workspaceBash tool to run shell commands. " +
      "After you see command output, summarize the exact stdout in your final reply.",
    prompt:
      "Use workspaceBash once with a single command that prints solana and helius versions: " +
      "`solana --version && helius --version`. " +
      "Quote the tool output in your answer.",
    tools: { workspaceBash: bashTool },
    toolChoice: { type: "tool", toolName: "workspaceBash" },
    stopWhen: stepCountIs(8),
    temperature: 0,
  });

  const text = result.text.trim();
  if (!text) {
    throw new Error("Model returned empty text after tool loop.");
  }

  const toolCalls = result.toolCalls ?? [];
  if (toolCalls.length === 0) {
    throw new Error("Expected at least one workspaceBash tool call.");
  }

  console.log("[smoke-workspace-bash-llm] tool calls:", toolCalls.length);
  console.log("[smoke-workspace-bash-llm] assistant text:\n");
  console.log(text);
  console.log("\n[smoke-workspace-bash-llm] ok");
};

await main();
