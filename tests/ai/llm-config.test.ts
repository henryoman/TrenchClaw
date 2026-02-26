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
  test("defaults to OpenRouter Step 3.5 Flash free", () => {
    process.env.OPENROUTER_API_KEY = "or-key";

    const resolved = resolveLlmProviderConfigFromEnv();

    expect(resolved).toEqual({
      provider: "openrouter",
      apiKey: "or-key",
      model: "stepfun/step-3.5-flash:free",
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  test("supports OpenAI", () => {
    process.env.TRENCHCLAW_AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "oa-key";
    process.env.TRENCHCLAW_AI_MODEL = "gpt-4.1-mini";

    const resolved = resolveLlmProviderConfigFromEnv();

    expect(resolved).toEqual({
      provider: "openai",
      apiKey: "oa-key",
      model: "gpt-4.1-mini",
      baseURL: undefined,
    });
  });

  test("supports custom OpenAI-compatible providers", () => {
    process.env.TRENCHCLAW_AI_PROVIDER = "openai-compatible";
    process.env.TRENCHCLAW_AI_API_KEY = "custom-key";
    process.env.TRENCHCLAW_AI_BASE_URL = "https://llm.example.com/v1";
    process.env.TRENCHCLAW_AI_MODEL = "vendor/model";

    const resolved = resolveLlmProviderConfigFromEnv();

    expect(resolved).toEqual({
      provider: "openai-compatible",
      apiKey: "custom-key",
      baseURL: "https://llm.example.com/v1",
      model: "vendor/model",
    });
  });
});
