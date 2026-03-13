import { afterEach, describe, expect, test } from "bun:test";

import { loadSystemPromptPayload, resetPromptLoaderCache } from "../../apps/trenchclaw/src/ai/llm/prompt-loader";

const ENV_KEYS = [
  "TRENCHCLAW_PROMPT_MANIFEST_FILE",
  "TRENCHCLAW_AGENT_MODE",
  "TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE",
  "TRENCHCLAW_KNOWLEDGE_DIR",
  "TRENCHCLAW_WORKSPACE_DIR",
  "TRENCHCLAW_RUNTIME_SETTINGS_FILE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_ACTIVE_INSTANCE_ID",
] as const;

const initialEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  resetPromptLoaderCache();
  for (const key of ENV_KEYS) {
    const value = initialEnv[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
});

describe("loadSystemPromptPayload", () => {
  test("builds the default primary runtime contract", async () => {
    process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = "apps/trenchclaw/.runtime-state/runtime/settings.json";
    process.env.TRENCHCLAW_VAULT_FILE = "apps/trenchclaw/.runtime-state/instances/01/vault.json";
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";

    const payload = await loadSystemPromptPayload();

    expect(payload.mode).toBe("primary");
    expect(payload.title).toBe("Primary Runtime Contract");
    expect(payload.sections.length).toBe(2);
    expect(payload.systemPrompt).toContain("TrenchClaw System Kernel");
    expect(payload.systemPrompt).toContain("## Runtime Contract");
    expect(payload.systemPrompt).toContain("## Enabled Model Tools");
    expect(payload.systemPrompt).toContain("workspaceBash");
    expect(payload.systemPrompt).toContain("queryRuntimeStore");
    expect(payload.systemPrompt).toContain("queryInstanceMemory");
    expect(payload.systemPrompt).toContain("- active instance: 01");
    expect(payload.systemPrompt).toContain(".runtime-state/instances/01/vault.json");
    expect(payload.systemPrompt).toContain("workspaceReadFile");
    expect(payload.systemPrompt).toContain(".runtime-state/generated/workspace-context.md");
    expect(payload.systemPrompt).not.toContain("## Prompt Assembly Order");
    expect(payload.systemPrompt).not.toContain("Source:");
    expect(payload.systemPrompt).not.toContain("SQLite SQL Schema Snapshot");
    expect(payload.systemPrompt).not.toContain("injected runtime capability appendix");
    expect(payload.promptFiles.length).toBe(1);
  });

  test("resolves explicit primary mode", async () => {
    process.env.TRENCHCLAW_RUNTIME_SETTINGS_FILE = "apps/trenchclaw/.runtime-state/runtime/settings.json";
    process.env.TRENCHCLAW_VAULT_FILE = "apps/trenchclaw/.runtime-state/instances/01/vault.json";
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "01";

    const payload = await loadSystemPromptPayload("primary");

    expect(payload.mode).toBe("primary");
    expect(payload.title).toBe("Primary Runtime Contract");
    expect(payload.systemPrompt).toContain("## Runtime Contract");
    expect(payload.systemPrompt).not.toContain("## Knowledge Routing");
  });

  test("throws on unknown modes", async () => {
    await expect(loadSystemPromptPayload("does-not-exist")).rejects.toThrow("Unknown agent mode");
  });
});
