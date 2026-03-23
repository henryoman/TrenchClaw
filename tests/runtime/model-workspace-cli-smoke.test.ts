import { describe, expect, test } from "bun:test";
import { mkdir, symlink, unlink } from "node:fs/promises";
import path from "node:path";

import { generateText, stepCountIs } from "ai";

import { loadAiSettings } from "../../apps/trenchclaw/src/ai/llm/ai-settings-file";
import { resolveLlmRuntimeBinding } from "../../apps/trenchclaw/src/ai/llm/client";
import { createLanguageModel } from "../../apps/trenchclaw/src/ai/llm/config";
import { RUNTIME_INSTANCE_ROOT } from "../../apps/trenchclaw/src/runtime/runtime-paths";
import { resolveInstanceToolBinRoot } from "../../apps/trenchclaw/src/runtime/instance-paths";
import {
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_LIST_DIRECTORY_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  createWorkspaceBashTools,
} from "../../apps/trenchclaw/src/runtime/workspace-bash";

const INSTANCE_ID = "01";

const OPENROUTER_KEY =
  process.env.OPENROUTER_API_KEY?.trim() || process.env.TRENCHCLAW_SMOKE_OPENROUTER_API_KEY?.trim();

const ensureToolBinSymlink = async (name: string, target: string): Promise<void> => {
  const toolBin = resolveInstanceToolBinRoot(INSTANCE_ID);
  await mkdir(toolBin, { recursive: true });
  const linkPath = path.join(toolBin, name);
  try {
    await unlink(linkPath);
  } catch {
    // ignore
  }
  await symlink(target, linkPath);
};

const resolveSmokeLanguageModel = async () => {
  const fromVault = await resolveLlmRuntimeBinding();
  if (fromVault.languageModel) {
    return fromVault.languageModel;
  }
  if (!OPENROUTER_KEY) {
    return null;
  }
  const { settings } = await loadAiSettings();
  if (settings.provider !== "openrouter") {
    return null;
  }
  return createLanguageModel({
    provider: "openrouter",
    apiKey: OPENROUTER_KEY,
    model: settings.model.trim(),
    baseURL: "https://openrouter.ai/api/v1",
  });
};

const hasClis = Boolean(Bun.which("solana") && Bun.which("helius"));

describe.skipIf(!OPENROUTER_KEY)("model drives workspace tools (live LLM)", () => {
  test.skipIf(!hasClis)(
    "model uses workspaceBash then workspaceListDirectory + workspaceReadFile",
    async () => {
      process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = INSTANCE_ID;

      await ensureToolBinSymlink("solana", Bun.which("solana")!);
      await ensureToolBinSymlink("helius", Bun.which("helius")!);

      const workspaceRoot = path.join(
        RUNTIME_INSTANCE_ROOT,
        INSTANCE_ID,
        "workspace",
        ".model-cli-smoke",
        crypto.randomUUID(),
      );
      await mkdir(workspaceRoot, { recursive: true });

      const tools = await createWorkspaceBashTools({
        workspaceRootDirectory: workspaceRoot,
        actor: "agent",
        commandTimeoutMs: 90_000,
      });

      const model = await resolveSmokeLanguageModel();
      if (!model) {
        throw new Error("Expected language model (vault or OPENROUTER_API_KEY)");
      }

      const aiTools = {
        workspaceBash: tools[WORKSPACE_BASH_TOOL_NAME],
        workspaceListDirectory: tools[WORKSPACE_LIST_DIRECTORY_TOOL_NAME],
        workspaceReadFile: tools[WORKSPACE_READ_FILE_TOOL_NAME],
      } as NonNullable<Parameters<typeof generateText>[0]["tools"]>;

      const result = await generateText({
        model,
        system:
          "You are testing TrenchClaw workspace tools. Call tools in order: " +
          "1) workspaceBash with typed JSON such as `{ \"type\": \"version\", \"program\": \"solana\" }` and another typed version call for `helius` " +
          "2) workspaceListDirectory with path `.`, depth 2, limit 80, includeHidden false " +
          "3) workspaceReadFile only if you see a file path worth reading under notes/ or output/ — otherwise skip step 3. " +
          "End with a one-sentence summary that includes the substring solana-cli or the word solana.",
        prompt: "Run the three steps (readFile optional).",
        tools: aiTools,
        stopWhen: stepCountIs(12),
        temperature: 0,
      });

      expect(result.toolCalls?.length ?? 0).toBeGreaterThan(0);
      expect(result.text.trim().length).toBeGreaterThan(0);
      expect(result.text.toLowerCase()).toMatch(/solana|helius/);
    },
    120_000,
  );
});
