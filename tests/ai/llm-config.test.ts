import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";

import { resolveLlmProviderConfigFromEnv, resolveLlmProviderConfigFromVault } from "../../apps/trenchclaw/src/ai/llm/config";

const ENV_KEYS = [
  "TRENCHCLAW_AI_PROVIDER",
  "TRENCHCLAW_AI_MODEL",
  "TRENCHCLAW_AI_BASE_URL",
  "TRENCHCLAW_AI_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
  "TRENCHCLAW_AI_SETTINGS_FILE",
  "TRENCHCLAW_AI_SETTINGS_TEMPLATE_FILE",
] as const;

const createdFiles: string[] = [];

const writeJson = async (content: unknown): Promise<string> => {
  const target = `/tmp/trenchclaw-llm-config-${crypto.randomUUID()}.json`;
  await Bun.write(target, `${JSON.stringify(content, null, 2)}\n`);
  createdFiles.push(target);
  return target;
};

const resetEnv = () => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
};

afterEach(() => {
  resetEnv();
});

afterEach(async () => {
  for (const filePath of createdFiles.splice(0)) {
    await rm(filePath, { force: true });
  }
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

describe("resolveLlmProviderConfigFromVault", () => {
  test("uses provider, model, and base URL from ai.json while reading the API key from vault.json", async () => {
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = await writeJson({
      provider: "openai-compatible",
      model: "vendor/model-1",
      baseURL: "https://llm.example.com/v1",
      defaultMode: "primary",
      temperature: 0.2,
      maxOutputTokens: 2048,
    });
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      llm: {
        "openai-compatible": {
          "api-key": "compat-key",
        },
      },
    });

    const resolved = await resolveLlmProviderConfigFromVault();

    expect(resolved).not.toBeNull();
    expect(resolved?.provider).toBe("openai-compatible");
    expect(resolved?.model).toBe("vendor/model-1");
    expect(resolved?.baseURL).toBe("https://llm.example.com/v1");
    expect(resolved?.apiKey).toBe("compat-key");
  });

  test("does not silently fall back to another provider when ai.json selects one without a key", async () => {
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = await writeJson({
      provider: "openai",
      model: "gpt-4.1-mini",
      baseURL: "",
      defaultMode: "primary",
      temperature: null,
      maxOutputTokens: null,
    });
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      llm: {
        openrouter: {
          "api-key": "or-key",
        },
      },
    });

    const resolved = await resolveLlmProviderConfigFromVault();

    expect(resolved).toBeNull();
  });
});
