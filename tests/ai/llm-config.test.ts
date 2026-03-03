import { afterEach, describe, expect, test } from "bun:test";

import { resolveLlmProviderConfigFromEnv } from "../../apps/trenchclaw/src/ai/llm/config";

const ENV_KEYS = [
  "TRENCHCLAW_AI_PROVIDER",
  "TRENCHCLAW_AI_MODEL",
  "TRENCHCLAW_AI_BASE_URL",
  "TRENCHCLAW_AI_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

const resetEnv = () => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
};

afterEach(() => {
  resetEnv();
});

describe("resolveLlmProviderConfigFromEnv", () => {
  test("is disabled when vault-only LLM mode is active", () => {
    process.env.OPENROUTER_API_KEY = "or-key";

    const resolved = resolveLlmProviderConfigFromEnv();

    expect(resolved).toBeNull();
  });

  test("ignores OpenAI env settings", () => {
    process.env.TRENCHCLAW_AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "oa-key";
    process.env.TRENCHCLAW_AI_MODEL = "gpt-4.1-mini";

    const resolved = resolveLlmProviderConfigFromEnv();

    expect(resolved).toBeNull();
  });

  test("ignores OpenAI-compatible env settings", () => {
    process.env.TRENCHCLAW_AI_PROVIDER = "openai-compatible";
    process.env.TRENCHCLAW_AI_API_KEY = "custom-key";
    process.env.TRENCHCLAW_AI_BASE_URL = "https://llm.example.com/v1";
    process.env.TRENCHCLAW_AI_MODEL = "vendor/model";

    const resolved = resolveLlmProviderConfigFromEnv();

    expect(resolved).toBeNull();
  });
});
