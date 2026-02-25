import { afterEach, describe, expect, test } from "bun:test";

import { loadSystemPromptPayload, resetPromptLoaderCache } from "../../src/ai/llm/prompt-loader";

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
  test("builds the default operator payload from the manifest", async () => {
    const payload = await loadSystemPromptPayload();

    expect(payload.mode).toBe("operator");
    expect(payload.systemPrompt).toContain("TrenchClaw System Prompt");
    expect(payload.systemPrompt).toContain("Mode: Operator");
    expect(payload.systemPrompt).toContain("Workspace Map (src/)");
    expect(payload.systemPrompt).toContain("# WORKSPACE ROOT: src/");
    expect(payload.systemPrompt).toContain("ai/");
    expect(payload.systemPrompt).toContain("User Settings (Resolved)");
    expect(payload.systemPrompt).toContain("\"primaryRpc\": \"helius\"");
    expect(payload.promptFiles.length).toBe(3);
  });

  test("resolves explicit operator mode", async () => {
    const payload = await loadSystemPromptPayload("operator");

    expect(payload.mode).toBe("operator");
    expect(payload.systemPrompt).toContain("Mode: Operator");
    expect(payload.systemPrompt).toContain("Workspace Map (src/)");
  });

  test("throws on unknown modes", async () => {
    await expect(loadSystemPromptPayload("does-not-exist")).rejects.toThrow("Unknown agent mode");
  });
});
