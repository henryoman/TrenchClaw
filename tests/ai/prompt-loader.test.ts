import { afterEach, describe, expect, test } from "bun:test";

import { loadSystemPromptPayload, resetPromptLoaderCache } from "../../apps/trenchclaw/src/ai/llm/prompt-loader";

const ENV_KEYS = [
  "TRENCHCLAW_PROMPT_MANIFEST_FILE",
  "TRENCHCLAW_AGENT_MODE",
  "TRENCHCLAW_KNOWLEDGE_MANIFEST_FILE",
  "TRENCHCLAW_KNOWLEDGE_DIR",
  "TRENCHCLAW_WORKSPACE_DIR",
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
  test("builds the default primary payload from the manifest", async () => {
    const payload = await loadSystemPromptPayload();

    expect(payload.mode).toBe("primary");
    expect(payload.title).toBe("Primary Mode");
    expect(payload.sections.length).toBe(8);
    expect(payload.systemPrompt).toContain("TrenchClaw System Prompt");
    expect(payload.systemPrompt).toContain("# Primary Mode");
    expect(payload.systemPrompt).toContain("## Prompt Assembly Order");
    expect(payload.systemPrompt).toContain("Mode: `primary`");
    expect(payload.systemPrompt).toContain("Core System Prompt");
    expect(payload.systemPrompt).toContain("Primary Mode Instructions");
    expect(payload.systemPrompt).toContain("Runtime Capability Appendix");
    expect(payload.systemPrompt).toContain("Workspace Context Snapshot");
    expect(payload.systemPrompt).toContain("Knowledge Manifest");
    expect(payload.systemPrompt).toContain("Filesystem Policy");
    expect(payload.systemPrompt).toContain("Resolved User Settings");
    expect(payload.systemPrompt).toContain("Live Callable Capability Appendix");
    expect(payload.systemPrompt).toContain("Runtime Chat Tool Catalog");
    expect(payload.systemPrompt).toContain("Exact Callable Tool Names");
    expect(payload.systemPrompt).toContain("workspaceBash");
    expect(payload.systemPrompt).toContain("queryRuntimeStore");
    expect(payload.systemPrompt).toContain("queryInstanceMemory");
    expect(payload.systemPrompt).toContain("Use `workspaceBash` first for discovery and search, then use `workspaceReadFile`");
    expect(payload.systemPrompt).toContain("Knowledge Manifest");
    expect(payload.systemPrompt).toContain("src/ai/brain/knowledge/deep-knowledge/*.md");
    expect(payload.systemPrompt).toContain("Workspace Map (apps/trenchclaw/)");
    expect(payload.systemPrompt).toContain("# WORKSPACE ROOT: apps/trenchclaw/");
    expect(payload.systemPrompt).toContain("Available Knowledge Manifest");
    expect(payload.systemPrompt).toContain("ai/");
    expect(payload.systemPrompt).toContain("User Settings (Resolved)");
    expect(payload.systemPrompt).not.toContain("\"actionName\": \"checkSolBalance\"");
    expect(
      payload.systemPrompt.includes("\"primaryRpc\": \"helius\"") ||
        payload.systemPrompt.includes("User settings could not be loaded:"),
    ).toBe(true);
    expect(payload.promptFiles.length).toBe(3);
  });

  test("resolves explicit primary mode", async () => {
    const payload = await loadSystemPromptPayload("primary");

    expect(payload.mode).toBe("primary");
    expect(payload.title).toBe("Primary Mode");
    expect(payload.systemPrompt).toContain("Mode: `primary`");
    expect(payload.systemPrompt).toContain("Workspace Map (apps/trenchclaw/)");
  });

  test("throws on unknown modes", async () => {
    await expect(loadSystemPromptPayload("does-not-exist")).rejects.toThrow("Unknown agent mode");
  });
});
