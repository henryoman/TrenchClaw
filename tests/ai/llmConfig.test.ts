import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";

import { resolveLlmProviderConfigFromEnv, resolveLlmProviderConfigFromVault } from "../../apps/trenchclaw/src/ai/llm/config";
import { normalizeAiSettingsInput } from "../../apps/trenchclaw/src/ai/llm/aiSettingsFile";

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

  test("ignores provider env overrides", () => {
    process.env.TRENCHCLAW_AI_PROVIDER = "gateway";
    process.env.TRENCHCLAW_AI_API_KEY = "gateway-key";
    process.env.TRENCHCLAW_AI_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

    const resolved = resolveLlmProviderConfigFromEnv();

    expect(resolved).toBeNull();
  });
});

describe("resolveLlmProviderConfigFromVault", () => {
  test.each([
    "qwen/qwen3.6-plus-preview:free",
    "stepfun/step-3.5-flash:free",
    "minimax/minimax-m2.5:free",
  ])("migrates retired model %s to the free models router", (model) => {
    expect(normalizeAiSettingsInput({ provider: "openrouter", model })).toMatchObject({
      provider: "openrouter",
      model: "openrouter/free",
    });
  });

  test("uses the configured model from ai.json and the OpenRouter key from vault.json", async () => {
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = await writeJson({
      provider: "openrouter",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      defaultMode: "primary",
      temperature: 0.2,
      maxOutputTokens: 2048,
    });
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      llm: {
        openrouter: {
          "api-key": "openrouter-key",
        },
      },
    });

    const resolved = await resolveLlmProviderConfigFromVault();

    expect(resolved).not.toBeNull();
    expect(resolved?.provider).toBe("openrouter");
    expect(resolved?.model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(resolved?.baseURL).toBe("https://openrouter.ai/api/v1");
    expect(resolved?.apiKey).toBe("openrouter-key");
  });

  test("does not fall back when gateway is selected for the OpenRouter-only model", async () => {
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = await writeJson({
      provider: "gateway",
      model: "some-other-model",
      defaultMode: "primary",
      temperature: null,
      maxOutputTokens: null,
    });
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      llm: {
        gateway: {
          "api-key": "gateway-key",
        },
        openrouter: {
          "api-key": "openrouter-key",
        },
      },
    });

    const resolved = await resolveLlmProviderConfigFromVault();

    expect(resolved).toBeNull();
  });

  test("normalizes unknown models back to the default OpenRouter model", async () => {
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = await writeJson({
      provider: "openrouter",
      model: "anything-else-gets-normalized",
      defaultMode: "primary",
      temperature: null,
      maxOutputTokens: null,
    });
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      llm: {
        gateway: {
          "api-key": "gateway-key",
        },
        openrouter: {
          "api-key": "openrouter-key",
        },
      },
    });

    const resolved = await resolveLlmProviderConfigFromVault();

    expect(resolved?.provider).toBe("openrouter");
    expect(resolved?.model).toBe("openrouter/free");
    expect(resolved?.apiKey).toBe("openrouter-key");
  });

  test("preserves the configured Gemma free model on OpenRouter", async () => {
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = await writeJson({
      provider: "openrouter",
      model: "google/gemma-4-31b-it:free",
      defaultMode: "primary",
      temperature: null,
      maxOutputTokens: null,
    });
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      llm: {
        gateway: {
          "api-key": "gateway-key",
        },
        openrouter: {
          "api-key": "openrouter-key",
        },
      },
    });

    const resolved = await resolveLlmProviderConfigFromVault();

    expect(resolved?.provider).toBe("openrouter");
    expect(resolved?.model).toBe("google/gemma-4-31b-it:free");
    expect(resolved?.apiKey).toBe("openrouter-key");
  });

  test("preserves the configured free models router on OpenRouter", async () => {
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = await writeJson({
      provider: "openrouter",
      model: "openrouter/free",
      defaultMode: "primary",
      temperature: null,
      maxOutputTokens: null,
    });
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      llm: {
        gateway: {
          "api-key": "gateway-key",
        },
        openrouter: {
          "api-key": "openrouter-key",
        },
      },
    });

    const resolved = await resolveLlmProviderConfigFromVault();

    expect(resolved?.provider).toBe("openrouter");
    expect(resolved?.model).toBe("openrouter/free");
    expect(resolved?.apiKey).toBe("openrouter-key");
  });

  test("uses OpenRouter when the selected model is OpenRouter-only", async () => {
    process.env.TRENCHCLAW_AI_SETTINGS_FILE = await writeJson({
      provider: "openrouter",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      defaultMode: "primary",
      temperature: null,
      maxOutputTokens: null,
    });
    process.env.TRENCHCLAW_VAULT_FILE = await writeJson({
      llm: {
        gateway: {
          "api-key": "gateway-key",
        },
        openrouter: {
          "api-key": "openrouter-key",
        },
      },
    });

    const resolved = await resolveLlmProviderConfigFromVault();

    expect(resolved?.provider).toBe("openrouter");
    expect(resolved?.model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(resolved?.apiKey).toBe("openrouter-key");
  });
});
