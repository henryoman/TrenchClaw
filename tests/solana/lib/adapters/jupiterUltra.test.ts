import { afterEach, describe, expect, test } from "bun:test";

import { createJupiterUltraAdapter } from "../../../../apps/trenchclaw/src/solana/lib/jupiter/ultra";
import {
  createJupiterUltraAdapterFromConfig,
  resolveJupiterUltraApiKey,
} from "../../../../apps/trenchclaw/src/solana/lib/jupiter/ultra";

describe("createJupiterUltraAdapter", () => {
  test("retries 429 responses using Retry-After before succeeding", async () => {
    const sleeps: number[] = [];
    const responses = [
      new Response(JSON.stringify({ error: "rate limited" }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "1",
        },
      }),
      new Response(
        JSON.stringify({
          requestId: "req-1",
          transaction: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    ];

    const adapter = createJupiterUltraAdapter({
      apiKey: "test-key",
      fetchImpl: (async () => responses.shift() ?? responses[responses.length - 1]!) as unknown as typeof fetch,
      rateLimitRetry: {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 10,
        jitterMs: 0,
        sleepImpl: async (ms) => {
          sleeps.push(ms);
        },
      },
    });

    const order = await adapter.getOrder({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "1000000",
    });

    expect(sleeps).toEqual([1_000]);
    expect(order.requestId).toBe("req-1");
    expect(order.transaction).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  test("preserves a null Ultra transaction when Jupiter returns quote-only error details", async () => {
    const adapter = createJupiterUltraAdapter({
      apiKey: "test-key",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            requestId: "req-no-tx",
            transaction: null,
            errorCode: 2,
            errorMessage: "Top up 0.01 SOL for gas",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        )) as unknown as typeof fetch,
    });

    const order = await adapter.getOrder({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "1000000",
      taker: "wallet-1",
    });

    expect(order.requestId).toBe("req-no-tx");
    expect(order.transaction).toBeNull();
    expect(order.errorCode).toBe(2);
    expect(order.errorMessage).toBe("Top up 0.01 SOL for gas");
  });
});

const MUTABLE_ENV_KEYS = [
  "JUPITER_ULTRA_API_KEY",
  "JUPITER_API_KEY",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
] as const;

const initialEnv = Object.fromEntries(MUTABLE_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];

const writeVaultJson = async (apiKey: string): Promise<string> => {
  const target = `/tmp/trenchclaw-jupiter-vault-${crypto.randomUUID()}.json`;
  await Bun.write(
    target,
    JSON.stringify(
      {
        integrations: {
          jupiter: {
            "api-key": apiKey,
          },
        },
      },
      null,
      2,
    ),
  );
  createdFiles.push(target);
  return target;
};

afterEach(async () => {
  for (const key of MUTABLE_ENV_KEYS) {
    const initial = initialEnv[key];
    if (initial === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = initial;
  }

  for (const filePath of createdFiles.splice(0)) {
    await Bun.$`rm -f ${filePath}`.quiet();
  }
});

describe("jupiter ultra vault config", () => {
  test("reads the shared Jupiter portal API key from vault (same as Swap API and Trigger)", async () => {
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson("vault-jupiter-key");

    expect(await resolveJupiterUltraApiKey()).toBe("vault-jupiter-key");

    const adapter = await createJupiterUltraAdapterFromConfig();
    expect(adapter).toBeDefined();
    expect(adapter?.baseUrl).toBe("https://api.jup.ag/ultra/v1");
  });

  test("ignores env variables and stays vault-only", async () => {
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson("");
    process.env.JUPITER_ULTRA_API_KEY = "env-jupiter-key";
    process.env.JUPITER_API_KEY = "env-jupiter-key-2";

    expect(await resolveJupiterUltraApiKey()).toBeUndefined();
    expect(await createJupiterUltraAdapterFromConfig()).toBeUndefined();
  });
});
