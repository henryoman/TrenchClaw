import { afterEach, describe, expect, test } from "bun:test";

import {
  createJupiterTriggerAdapter,
  createJupiterTriggerAdapterFromConfig,
  resolveJupiterTriggerApiKey,
} from "../../../../apps/trenchclaw/src/solana/lib/jupiter/trigger";

const MUTABLE_ENV_KEYS = [
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
] as const;

const initialEnv = Object.fromEntries(MUTABLE_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];

const writeVaultJson = async (apiKey: string): Promise<string> => {
  const target = `/tmp/trenchclaw-jupiter-trigger-vault-${crypto.randomUUID()}.json`;
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

describe("jupiter trigger adapter", () => {
  test("formats create and list requests with the shared Jupiter API key", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = createJupiterTriggerAdapter({
      apiKey: "trigger-key",
      fetchImpl: (async (url: URL | RequestInfo, init?: RequestInit) => {
        requests.push({ url: String(url), init });
        if (String(url).includes("/createOrder")) {
          return new Response(JSON.stringify({
            requestId: "req-1",
            transaction: "tx-1",
            order: "order-1",
          }));
        }

        return new Response(JSON.stringify({
          user: "wallet-1",
          orderStatus: "open",
          orders: [],
          page: 2,
          totalPages: 4,
        }));
      }) as unknown as typeof fetch,
    });

    const created = await adapter.createOrder({
      maker: "wallet-1",
      payer: "wallet-1",
      inputMint: "mint-in",
      outputMint: "mint-out",
      params: {
        makingAmount: "1000",
        takingAmount: "2500",
        expiredAt: 1_700_000_000,
      },
      computeUnitPrice: "auto",
    });
    const listed = await adapter.getTriggerOrders({
      user: "wallet-1",
      orderStatus: "active",
      page: 2,
      inputMint: "mint-in",
      outputMint: "mint-out",
      includeFailedTx: false,
    });

    expect(created.requestId).toBe("req-1");
    expect(created.transaction).toBe("tx-1");
    expect(created.order).toBe("order-1");
    expect(listed.page).toBe(2);
    expect(listed.totalPages).toBe(4);

    expect(requests[0]?.url).toContain("/createOrder");
    expect(requests[0]?.init?.headers).toBeDefined();
    expect(requests[1]?.url).toContain("/getTriggerOrders?");
    expect(requests[1]?.url).toContain("user=wallet-1");
    expect(requests[1]?.url).toContain("orderStatus=active");
    expect(requests[1]?.url).toContain("page=2");
  });

  test("reads the shared Jupiter portal API key from vault (same path as Ultra)", async () => {
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson("vault-trigger-key");

    expect(await resolveJupiterTriggerApiKey()).toBe("vault-trigger-key");

    const adapter = await createJupiterTriggerAdapterFromConfig();
    expect(adapter).toBeDefined();
    expect(adapter?.baseUrl).toBe("https://api.jup.ag/trigger/v1");
  });
});
