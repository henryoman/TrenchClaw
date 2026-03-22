import { afterEach, describe, expect, test } from "bun:test";

import {
  createJupiterAdapter,
  createJupiterAdapterFromConfig,
  resolveJupiterApiKey,
} from "../../../../apps/trenchclaw/src/solana/lib/adapters/jupiter";

const MUTABLE_ENV_KEYS = [
  "JUPITER_API_KEY",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
] as const;

const initialEnv = Object.fromEntries(MUTABLE_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];

const writeVaultJson = async (apiKey: string): Promise<string> => {
  const target = `/tmp/trenchclaw-jupiter-v2-vault-${crypto.randomUUID()}.json`;
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

describe("createJupiterAdapter", () => {
  test("builds the expected /build query and retries 429 responses", async () => {
    const sleeps: number[] = [];
    const seenUrls: string[] = [];
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
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          inAmount: "1000000",
          outAmount: "123456",
          computeBudgetInstructions: [],
          setupInstructions: [],
          swapInstruction: {
            programId: "11111111111111111111111111111111",
            accounts: [],
            data: "",
          },
          cleanupInstruction: null,
          otherInstructions: [],
          addressesByLookupTableAddress: null,
          blockhashWithMetadata: {
            blockhash: Array.from(Buffer.from("9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF1", "utf8")),
            lastValidBlockHeight: 123,
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    ];

    const adapter = createJupiterAdapter({
      apiKey: "test-key",
      fetchImpl: (async (input) => {
        seenUrls.push(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
        return responses.shift() ?? responses[responses.length - 1]!;
      }) as typeof fetch,
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

    const build = await adapter.buildSwap({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "1000000",
      taker: "wallet1111111111111111111111111111111111111",
      slippageBps: 75,
    });

    expect(sleeps).toEqual([1_000]);
    expect(seenUrls[0]).toContain("/build?");
    expect(seenUrls[0]).toContain("inputMint=So11111111111111111111111111111111111111112");
    expect(seenUrls[0]).toContain("outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(seenUrls[0]).toContain("amount=1000000");
    expect(seenUrls[0]).toContain("slippageBps=75");
    expect(build.outAmount).toBe("123456");
    expect(build.swapInstruction.programId).toBe("11111111111111111111111111111111");
  });
});

describe("jupiter swap api vault config", () => {
  test("reads the Jupiter Swap API key from vault", async () => {
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson("vault-jupiter-key");

    expect(await resolveJupiterApiKey()).toBe("vault-jupiter-key");

    const adapter = await createJupiterAdapterFromConfig();
    expect(adapter).toBeDefined();
    expect(adapter?.baseUrl).toBe("https://api.jup.ag/swap/v2");
  });

  test("ignores env variables and stays vault-only", async () => {
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson("");
    process.env.JUPITER_API_KEY = "env-jupiter-key";

    expect(await resolveJupiterApiKey()).toBeUndefined();
    expect(await createJupiterAdapterFromConfig()).toBeUndefined();
  });
});
