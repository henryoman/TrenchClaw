import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { InMemoryStateStore } from "../../../../apps/trenchclaw/src/ai";
import { createActionContext } from "../../../../apps/trenchclaw/src/ai/contracts/types/context";
import {
  createGetManagedWalletContentsAction,
  createGetWalletContentsAction,
  resetWalletContentsCachesForTests,
} from "../../../../apps/trenchclaw/src/tools/wallet/getManagedWalletContents";
import { runtimeStatePath } from "../../../helpers/corePaths";

const RUNTIME_INSTANCE_DIRECTORY = runtimeStatePath("instances");
const tempInstanceDirectories: string[] = [];
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const previousFetch = globalThis.fetch;

const parseRpcBody = (init?: RequestInit): unknown => init?.body ? JSON.parse(String(init.body)) : null;

const expectSingleRpcRequest = (body: unknown): { id: string; method: string } => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected a single JSON-RPC request body");
  }
  return body as { id: string; method: string };
};

const writeWalletBatchSetting = async (instanceId: string, enabled: boolean): Promise<void> => {
  const settingsDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId, "settings");
  await mkdir(settingsDirectory, { recursive: true });
  await writeFile(
    path.join(settingsDirectory, "trading.json"),
    `${JSON.stringify({
      configVersion: 1,
      trading: {
        preferences: {
          walletRpcBatchingEnabled: enabled,
        },
      },
    }, null, 2)}\n`,
    "utf8",
  );
};

afterEach(async () => {
  resetWalletContentsCachesForTests();
  for (const directoryPath of tempInstanceDirectories.splice(0)) {
    await rm(directoryPath, { recursive: true, force: true }).catch(() => {});
  }
  if (previousActiveInstanceId === undefined) {
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
  } else {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
  }
  globalThis.fetch = previousFetch;
});

describe("getManagedWalletContentsAction", () => {
  test("does not discover managed wallets from label files when the wallet library is missing", async () => {
    const instanceId = "97";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const walletGroupDirectory = path.join(instanceDirectory, "keypairs", "core");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(walletGroupDirectory, { recursive: true });

    await writeFile(path.join(walletGroupDirectory, "000.json"), "[1,2,3]\n", "utf8");
    await writeFile(
      path.join(walletGroupDirectory, "000.label.json"),
      `${JSON.stringify({
        version: 1,
        walletId: "fixture-wallets.fixture001",
        walletGroup: "fixture-wallets",
        walletName: "fixture001",
        walletFileName: "000.json",
        address: "11111111111111111111111111111111",
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      })}\n`,
      "utf8",
    );
    await writeFile(path.join(walletGroupDirectory, "001.json"), "[4,5,6]\n", "utf8");
    await writeFile(
      path.join(walletGroupDirectory, "001.label.json"),
      `${JSON.stringify({
        version: 1,
        walletId: "fixture-wallets.fixture002",
        walletGroup: "fixture-wallets",
        walletName: "fixture002",
        walletFileName: "001.json",
        address: "Stake11111111111111111111111111111111111111",
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      })}\n`,
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    const action = createGetManagedWalletContentsAction({
      loadWalletContents: async ({ address }) => ({
        lamports:
          address === "11111111111111111111111111111111"
            ? 1_500_000_000n
            : 250_000_000n,
        tokenBalances:
          address === "11111111111111111111111111111111"
            ? [
                {
                  mintAddress: "So11111111111111111111111111111111111111112",
                  tokenProgram: "spl-token",
                  programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                  balanceRaw: "1500000",
                  balance: 1.5,
                  balanceUiString: "1.5",
                  decimals: 6,
                  tokenAccountAddresses: ["Ata111111111111111111111111111111111111111"],
                },
                {
                  mintAddress: "TokenMint22222222222222222222222222222222222",
                  tokenProgram: "token-2022",
                  programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
                  balanceRaw: "42",
                  balance: 42,
                  balanceUiString: "42",
                  decimals: 0,
                  tokenAccountAddresses: ["Ata222222222222222222222222222222222222222"],
                },
              ]
            : [
                {
                  mintAddress: "So11111111111111111111111111111111111111112",
                  tokenProgram: "spl-token",
                  programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                  balanceRaw: "250000",
                  balance: 0.25,
                  balanceUiString: "0.25",
                  decimals: 6,
                  tokenAccountAddresses: ["Ata333333333333333333333333333333333333333"],
                },
              ],
      }),
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      walletGroup: "fixture-wallets",
      includeZeroBalances: false,
    });

    expect(result.ok).toBe(true);
    const payload = result.data as {
      instanceId: string;
      walletCount: number;
      discoveredVia: string;
      wallets: Array<{
        walletId: string;
        walletGroup: string;
        walletName: string;
        address: string;
        balanceLamports: string;
        balanceSol: number;
        tokenCount: number;
        tokenBalances: Array<{
          mintAddress: string;
          tokenProgram: string;
          balanceRaw: string;
          balanceUiString: string;
        }>;
      }>;
      totalBalanceLamports: string;
      totalBalanceSol: number;
      tokenTotals: Array<{
        mintAddress: string;
        tokenProgram: string;
        balanceRaw: string;
        balanceUiString: string;
        walletCount: number;
      }>;
    };

    expect(payload.instanceId).toBe(instanceId);
    expect(payload.walletCount).toBe(0);
    expect(payload.discoveredVia).toBe("wallet-library");
    expect(payload.wallets).toEqual([]);
    expect(payload.totalBalanceLamports).toBe("0");
    expect(payload.totalBalanceSol).toBe(0);
    expect(payload.tokenTotals).toEqual([]);
  });

  test("selects specific wallets by wallet name selectors", async () => {
    const instanceId = "91";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      [
        JSON.stringify({
          walletId: "core-wallets.wallet_000",
          walletGroup: "core-wallets",
          walletName: "wallet_000",
          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
        }),
        JSON.stringify({
          walletId: "core-wallets.wallet_001",
          walletGroup: "core-wallets",
          walletName: "wallet_001",
          address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.label.json"),
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    const action = createGetManagedWalletContentsAction({
      loadWalletContents: async ({ address }) => ({
        lamports: address === "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU" ? 1_000_000_000n : 2_000_000_000n,
        tokenBalances: [],
      }),
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      wallets: ["wallet_001"],
      includeZeroBalances: false,
    });

    expect(result.ok).toBe(true);
    const payload = result.data as {
      walletCount: number;
      wallets: Array<{ walletName: string; balanceLamports: string }>;
      totalBalanceLamports: string;
    };
    expect(payload.walletCount).toBe(1);
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletName: "wallet_001",
        balanceLamports: "2000000000",
      }),
    ]);
    expect(payload.totalBalanceLamports).toBe("2000000000");
  });

  test("queues heavy wallet scans instead of forcing a large inline read", async () => {
    const instanceId = "92";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      Array.from({ length: 5 }, (_, index) =>
        JSON.stringify({
          walletId: `core-wallets.wallet_${String(index).padStart(3, "0")}`,
          walletGroup: "core-wallets",
          walletName: `wallet_${String(index).padStart(3, "0")}`,
          address: [
            "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
            "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
            "11111111111111111111111111111111",
            "Stake11111111111111111111111111111111111111",
            "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF",
          ][index]!,
          keypairFilePath: path.join(instanceDirectory, `keypairs/core-wallets/wallet_${String(index).padStart(3, "0")}.json`),
          walletLabelFilePath: path.join(instanceDirectory, `keypairs/core-wallets/wallet_${String(index).padStart(3, "0")}.label.json`),
        }))
        .join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    let enqueueInvocationCount = 0;
    const stateStore = new InMemoryStateStore();
    const action = createGetManagedWalletContentsAction();

    const result = await action.execute(
      createActionContext({
        actor: "agent",
        stateStore,
        enqueueJob: async (input) => {
          enqueueInvocationCount += 1;
          return {
            id: "job-wallet-scan-queued",
            serialNumber: 7,
            botId: input.botId,
            routineName: input.routineName,
            status: "pending",
            config: input.config ?? {},
            cyclesCompleted: 0,
            totalCycles: input.totalCycles,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        },
      }),
      {
        walletGroup: "core-wallets",
        includeZeroBalances: false,
      },
    );

    expect(result.ok).toBe(true);
    expect(enqueueInvocationCount).toBe(1);
    const payload = result.data as {
      queued: boolean;
      requestKey: string;
      job: { serialNumber: number | null; routineName: string; status: string };
    };
    expect(payload.queued).toBe(true);
    expect(payload.requestKey).toContain("wallet-contents:");
    expect(payload.job.serialNumber).toBe(7);
    expect(payload.job.routineName).toBe("walletInventoryScan");
    expect(payload.job.status).toBe("pending");
  });

  test("falls back to walletGroup filters when a hallucinated selector includes an empty walletNames array", async () => {
    const instanceId = "93";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      [
        JSON.stringify({
          walletId: "core-wallets.000",
          walletGroup: "core-wallets",
          walletName: "000",
          address: "BHyJ3Jv7L7Q4rqkof53MPhnpx4z7jpHRtENzL4Q4WwLX",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/000.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/000.label.json"),
        }),
        JSON.stringify({
          walletId: "core-wallets.001",
          walletGroup: "core-wallets",
          walletName: "001",
          address: "6ZjR4iY9HdHzLcjRUn7xtr4kjbtD7a3nDw1kUkGojFjt",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/001.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/001.label.json"),
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    const action = createGetManagedWalletContentsAction({
      loadWalletContents: async ({ address }) => ({
        lamports: address === "BHyJ3Jv7L7Q4rqkof53MPhnpx4z7jpHRtENzL4Q4WwLX" ? 1_000_000_000n : 2_000_000_000n,
        tokenBalances: [],
      }),
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      wallet: "core-wallets",
      wallets: [{ id: "core-wallets", group: "core-wallets", name: "all" }],
      walletGroup: "core-wallets",
      walletNames: [],
      includeZeroBalances: false,
    });

    expect(result.ok).toBe(true);
    const payload = result.data as {
      walletCount: number;
      wallets: Array<{ walletName: string }>;
      totalBalanceLamports: string;
    };
    expect(payload.walletCount).toBe(2);
    expect(payload.wallets.map((wallet) => wallet.walletName)).toEqual(["000", "001"]);
    expect(payload.totalBalanceLamports).toBe("3000000000");
  });

  test("uses one regular-RPC batch request to load SOL and SPL contents across wallets", async () => {
    const instanceId = "98";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      [
        JSON.stringify({
          walletId: "core-wallets.wallet_000",
          walletGroup: "core-wallets",
          walletName: "wallet_000",
          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
        }),
        JSON.stringify({
          walletId: "core-wallets.wallet_001",
          walletGroup: "core-wallets",
          walletName: "wallet_001",
          address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.label.json"),
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;
    await writeWalletBatchSetting(instanceId, true);

    let seenRpcBody: unknown;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenRpcBody = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(
        JSON.stringify([
          {
            jsonrpc: "2.0",
            id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:token2022",
            result: { value: [] },
          },
          {
            jsonrpc: "2.0",
            id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance",
            result: { value: 40_010_000 },
          },
          {
            jsonrpc: "2.0",
            id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:spl",
            result: {
              value: [
                {
                  pubkey: "Ata111111111111111111111111111111111111111",
                  account: {
                    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                    data: {
                      parsed: {
                        info: {
                          mint: "So11111111111111111111111111111111111111112",
                          tokenAmount: {
                            amount: "1500000",
                            decimals: 6,
                            uiAmountString: "1.5",
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
          {
            jsonrpc: "2.0",
            id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:token2022",
            result: {
              value: [
                {
                  pubkey: "Ata222222222222222222222222222222222222222",
                  account: {
                    owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
                    data: {
                      parsed: {
                        info: {
                          mint: "TokenMint22222222222222222222222222222222222",
                          tokenAmount: {
                            amount: "42",
                            decimals: 0,
                            uiAmountString: "42",
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
          {
            jsonrpc: "2.0",
            id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:spl",
            result: { value: [] },
          },
          {
            jsonrpc: "2.0",
            id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:balance",
            result: { value: 0 },
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const action = createGetManagedWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        walletGroup: "core-wallets",
        includeZeroBalances: false,
      },
    );

    expect(seenRpcBody).toEqual([
      expect.objectContaining({
        method: "getBalance",
        id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance",
      }),
      expect.objectContaining({
        method: "getTokenAccountsByOwner",
        id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:spl",
      }),
      expect.objectContaining({
        method: "getTokenAccountsByOwner",
        id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:token2022",
      }),
      expect.objectContaining({
        method: "getBalance",
        id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:balance",
      }),
      expect.objectContaining({
        method: "getTokenAccountsByOwner",
        id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:spl",
      }),
      expect.objectContaining({
        method: "getTokenAccountsByOwner",
        id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:token2022",
      }),
    ]);

    expect(result.ok).toBe(true);
    const payload = result.data as {
      walletCount: number;
      totalBalanceLamports: string;
      wallets: Array<{
        walletName: string;
        balanceLamports: string;
        tokenCount: number;
        tokenBalances: Array<{
          mintAddress: string;
          tokenProgram: string;
          balanceUiString: string;
        }>;
      }>;
      tokenTotals: Array<{
        mintAddress: string;
        tokenProgram: string;
        balanceUiString: string;
      }>;
    };

    expect(payload.walletCount).toBe(2);
    expect(payload.totalBalanceLamports).toBe("40010000");
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletName: "wallet_000",
        balanceLamports: "40010000",
        tokenCount: 2,
        tokenBalances: [
          expect.objectContaining({
            mintAddress: "So11111111111111111111111111111111111111112",
            tokenProgram: "spl-token",
            balanceUiString: "1.5",
          }),
          expect.objectContaining({
            mintAddress: "TokenMint22222222222222222222222222222222222",
            tokenProgram: "token-2022",
            balanceUiString: "42",
          }),
        ],
      }),
      expect.objectContaining({
        walletName: "wallet_001",
        balanceLamports: "0",
        tokenCount: 0,
        tokenBalances: [],
      }),
    ]);
    expect(payload.tokenTotals).toEqual([
      expect.objectContaining({
        mintAddress: "So11111111111111111111111111111111111111112",
        tokenProgram: "spl-token",
        balanceUiString: "1.5",
      }),
      expect.objectContaining({
        mintAddress: "TokenMint22222222222222222222222222222222222",
        tokenProgram: "token-2022",
        balanceUiString: "42",
      }),
    ]);
  });

  test("prefers Helius DAS when Helius is the selected private RPC", async () => {
    const instanceId = "99";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      JSON.stringify({
        walletId: "core-wallets.wallet_000",
        walletGroup: "core-wallets",
        walletName: "wallet_000",
        address: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1",
        keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
        walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
      }),
      "utf8",
    );
    await mkdir(path.join(instanceDirectory, "secrets"), { recursive: true });
    await writeFile(
      path.join(instanceDirectory, "secrets", "vault.json"),
      `${JSON.stringify({
        rpc: {
          default: {
            "provider-id": "helius",
            "api-key": "test-helius-key",
            "http-url": "https://mainnet.helius-rpc.com/?api-key=test-helius-key",
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    let seenUrl = "";
    let seenRpcBody: unknown;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = typeof input === "string" ? input : input.toString();
      seenRpcBody = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(
        JSON.stringify([
          {
            jsonrpc: "2.0",
            id: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:helius-das:1",
            result: {
              nativeBalance: {
                lamports: 2_000_000_000,
              },
              items: [
                {
                  id: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                  interface: "FungibleToken",
                  content: {
                    metadata: {
                      name: "USD Coin",
                      symbol: "USDC",
                    },
                    links: {
                      image: "https://example.test/usdc.png",
                    },
                  },
                  token_info: {
                    balance: "1234500",
                    decimals: 6,
                    token_program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                    associated_token_address: "AtaUsdc11111111111111111111111111111111111",
                    price_info: {
                      price_per_token: 1,
                      total_price: 1.2345,
                    },
                  },
                },
                {
                  id: "CnfT11111111111111111111111111111111111111",
                  interface: "CompressedNFT",
                  compression: {
                    compressed: true,
                  },
                },
              ],
            },
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const action = createGetManagedWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        walletGroup: "core-wallets",
        includeZeroBalances: false,
      },
    );

    expect(seenUrl).toBe("https://mainnet.helius-rpc.com/?api-key=test-helius-key");
    expect(seenRpcBody).toEqual(
      expect.objectContaining({
        method: "getAssetsByOwner",
        id: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:helius-das:1",
        params: {
          ownerAddress: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1",
          page: 1,
          limit: 1000,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
            showZeroBalance: false,
          },
        },
      }),
    );

    expect(result.ok).toBe(true);
    const payload = result.data as {
      dataSource: string;
      totalCollectibleCount: number;
      totalPricedTokenUsd: number | null;
      wallets: Array<{
        balanceLamports: string;
        collectibleCount: number;
        compressedCollectibleCount: number;
        tokenBalances: Array<{
          mintAddress: string;
          symbol?: string | null;
          name?: string | null;
          valueUsd?: number | null;
        }>;
      }>;
    };

    expect(payload.dataSource).toBe("helius-das");
    expect(payload.totalCollectibleCount).toBe(1);
    expect(payload.totalPricedTokenUsd).toBe(1.2345);
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        balanceLamports: "2000000000",
        collectibleCount: 1,
        compressedCollectibleCount: 1,
        tokenBalances: [
          expect.objectContaining({
            mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            symbol: "USDC",
            name: "USD Coin",
            valueUsd: 1.2345,
          }),
        ],
      }),
    ]);
  });

  test("falls back to sequential raw RPC reads after batch rate limiting", async () => {
    const instanceId = "96";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      [
        JSON.stringify({
          walletId: "core-wallets.wallet_000",
          walletGroup: "core-wallets",
          walletName: "wallet_000",
          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
        }),
        JSON.stringify({
          walletId: "core-wallets.wallet_001",
          walletGroup: "core-wallets",
          walletName: "wallet_001",
          address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.label.json"),
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    let requestCount = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = parseRpcBody(init);
      requestCount += 1;
      if (Array.isArray(body) && body.length > 1) {
        return new Response(
          JSON.stringify([
            {
              jsonrpc: "2.0",
              error: {
                code: 429,
                message: "Too many requests for a specific RPC call",
              },
              id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance",
            },
          ]),
          {
            status: 429,
            headers: { "content-type": "application/json" },
          },
        );
      }

      const request = expectSingleRpcRequest(body);
      const responses: Record<string, unknown> = {
        "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance": {
          jsonrpc: "2.0",
          id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance",
          result: { value: 40_010_000 },
        },
        "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:spl": {
          jsonrpc: "2.0",
          id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:spl",
          result: {
            value: [
              {
                pubkey: "Ata111111111111111111111111111111111111111",
                account: {
                  owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                  data: {
                    parsed: {
                      info: {
                        mint: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
                        tokenAmount: {
                          amount: "37227586660488",
                          decimals: 9,
                          uiAmountString: "37227.586660488",
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:token2022": {
          jsonrpc: "2.0",
          id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:token2022",
          result: { value: [] },
        },
        "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:balance": {
          jsonrpc: "2.0",
          id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:balance",
          result: { value: 0 },
        },
        "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:spl": {
          jsonrpc: "2.0",
          id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:spl",
          result: { value: [] },
        },
        "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:token2022": {
          jsonrpc: "2.0",
          id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:token2022",
          result: { value: [] },
        },
      };

      return new Response(JSON.stringify(responses[request.id]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await writeWalletBatchSetting(instanceId, true);
    const action = createGetManagedWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        walletGroup: "core-wallets",
        includeZeroBalances: false,
      },
    );

    expect(result.ok).toBe(true);
    expect(requestCount).toBeGreaterThan(1);
    const payload = result.data as {
      dataSource: string;
      wallets: Array<{ walletName: string; tokenCount: number }>;
    };
    expect(payload.dataSource).toBe("rpc-sequential");
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletName: "wallet_000",
        tokenCount: 1,
      }),
      expect.objectContaining({
        walletName: "wallet_001",
        tokenCount: 0,
      }),
    ]);
  }, 15000);

  test("falls back to raw RPC when Helius DAS inventory reads are rate-limited", async () => {
    const instanceId = "93";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      [
        JSON.stringify({
          walletId: "core-wallets.wallet_000",
          walletGroup: "core-wallets",
          walletName: "wallet_000",
          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    let sawHeliusDasRequest = false;
    let sawRawRpcBatch = false;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = parseRpcBody(init);
      if (Array.isArray(body) && body.some((request) => request.method === "getAssetsByOwner")) {
        sawHeliusDasRequest = true;
        return new Response("rate limited", {
          status: 429,
          headers: { "content-type": "text/plain" },
        });
      }
      if (!Array.isArray(body) && expectSingleRpcRequest(body).method === "getAssetsByOwner") {
        sawHeliusDasRequest = true;
        return new Response("rate limited", {
          status: 429,
          headers: { "content-type": "text/plain" },
        });
      }

      sawRawRpcBatch = Array.isArray(body);
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: expectSingleRpcRequest(body).id,
          result: expectSingleRpcRequest(body).id.endsWith(":balance") ? { value: 40_010_000 } : { value: [] },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const action = createGetManagedWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://mainnet.helius-rpc.com/?api-key=test-key",
      }),
      {
        walletGroup: "core-wallets",
        includeZeroBalances: false,
      },
    );

    expect(result.ok).toBe(true);
    expect(sawHeliusDasRequest).toBe(true);
    expect(sawRawRpcBatch).toBe(false);
    const payload = result.data as {
      dataSource: string;
      wallets: Array<{ walletName: string; balanceLamports: string }>;
    };
    expect(payload.dataSource).toBe("rpc-sequential");
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletName: "wallet_000",
        balanceLamports: "40010000",
      }),
    ]);
  }, 15000);

  test("falls back to sequential raw RPC reads after batch timeout", async () => {
    const instanceId = "95";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      [
        JSON.stringify({
          walletId: "core-wallets.wallet_000",
          walletGroup: "core-wallets",
          walletName: "wallet_000",
          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    let requestCount = 0;
    let sawTimeoutSignal = false;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = parseRpcBody(init);
      requestCount += 1;
      if (Array.isArray(body) && body.length > 1) {
        sawTimeoutSignal = Boolean(init?.signal);
        throw new Error("request timed out waiting for RPC response");
      }

      const request = expectSingleRpcRequest(body);
      const responses: Record<string, unknown> = {
        "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance": {
          jsonrpc: "2.0",
          id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance",
          result: { value: 40_010_000 },
        },
        "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:spl": {
          jsonrpc: "2.0",
          id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:spl",
          result: { value: [] },
        },
        "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:token2022": {
          jsonrpc: "2.0",
          id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:token2022",
          result: { value: [] },
        },
      };

      return new Response(JSON.stringify(responses[request.id]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await writeWalletBatchSetting(instanceId, true);
    const action = createGetManagedWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        walletGroup: "core-wallets",
        includeZeroBalances: false,
      },
    );

    expect(result.ok).toBe(true);
    expect(sawTimeoutSignal).toBe(true);
    expect(requestCount).toBeGreaterThan(1);
    const payload = result.data as {
      dataSource: string;
      wallets: Array<{ walletName: string; balanceLamports: string }>;
    };
    expect(payload.dataSource).toBe("rpc-sequential");
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletName: "wallet_000",
        balanceLamports: "40010000",
      }),
    ]);
  });

  test("returns partial wallet results when one sequential RPC wallet stays rate-limited", async () => {
    const instanceId = "94";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      [
        JSON.stringify({
          walletId: "core-wallets.wallet_000",
          walletGroup: "core-wallets",
          walletName: "wallet_000",
          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
        }),
        JSON.stringify({
          walletId: "core-wallets.wallet_001",
          walletGroup: "core-wallets",
          walletName: "wallet_001",
          address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.label.json"),
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = expectSingleRpcRequest(parseRpcBody(init));
      if (request.id.startsWith("3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:")) {
        return new Response("rate limited", {
          status: 429,
          headers: { "content-type": "text/plain" },
        });
      }

      const responses: Record<string, unknown> = {
        "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance": {
          jsonrpc: "2.0",
          id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance",
          result: { value: 40_010_000 },
        },
        "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:spl": {
          jsonrpc: "2.0",
          id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:spl",
          result: { value: [] },
        },
        "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:token2022": {
          jsonrpc: "2.0",
          id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:token2022",
          result: { value: [] },
        },
      };

      return new Response(JSON.stringify(responses[request.id]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const action = createGetManagedWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        walletGroup: "core-wallets",
        includeZeroBalances: false,
      },
    );

    expect(result.ok).toBe(true);
    const payload = result.data as {
      dataSource: string;
      partial: boolean;
      wallets: Array<{ walletName: string; balanceLamports: string }>;
      walletErrors: Array<{ walletName: string; retryable: boolean }>;
    };
    expect(payload.dataSource).toBe("rpc-sequential");
    expect(payload.partial).toBe(true);
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletName: "wallet_000",
        balanceLamports: "40010000",
      }),
    ]);
    expect(payload.walletErrors).toEqual([
      expect.objectContaining({
        walletName: "wallet_001",
        retryable: true,
      }),
    ]);
  }, 15000);

  test("loads selected wallets through the simple getWalletContents action", async () => {
    const instanceId = "81";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      [
        JSON.stringify({
          walletId: "core-wallets.wallet_000",
          walletGroup: "core-wallets",
          walletName: "wallet_000",
          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
        }),
        JSON.stringify({
          walletId: "core-wallets.wallet_001",
          walletGroup: "core-wallets",
          walletName: "wallet_001",
          address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.label.json"),
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    const seenRpcBodies: unknown[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenRpcBodies.push(parseRpcBody(init));
      return new Response(
        JSON.stringify([
          {
            jsonrpc: "2.0",
            id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:balance",
            result: { value: 123_000_000 },
          },
          {
            jsonrpc: "2.0",
            id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:spl",
            result: { value: [] },
          },
          {
            jsonrpc: "2.0",
            id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:token2022",
            result: { value: [] },
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    const action = createGetWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        wallets: ["wallet_001"],
        includeZeroBalances: false,
      },
    );

    expect(seenRpcBodies).toEqual([
      expect.objectContaining({
        id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:balance",
      }),
      expect.objectContaining({
        id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:spl",
      }),
      expect.objectContaining({
        id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:token2022",
      }),
    ]);
    expect(result.ok).toBe(true);
    const payload = result.data as {
      walletCount: number;
      wallets: Array<{ walletName: string; balanceLamports: string }>;
    };
    expect(payload.walletCount).toBe(1);
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletName: "wallet_001",
        balanceLamports: "123000000",
      }),
    ]);
  });

  test("prefers configured Helius RPC for the simple getWalletContents action", async () => {
    const instanceId = "82";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      JSON.stringify({
        walletId: "core-wallets.wallet_000",
        walletGroup: "core-wallets",
        walletName: "wallet_000",
        address: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1",
        keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
        walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
      }),
      "utf8",
    );
    await mkdir(path.join(instanceDirectory, "secrets"), { recursive: true });
    await writeFile(
      path.join(instanceDirectory, "secrets", "vault.json"),
      `${JSON.stringify({
        rpc: {
          default: {
            "provider-id": "helius",
            "api-key": "test-helius-key",
            "http-url": "https://mainnet.helius-rpc.com/?api-key=test-helius-key",
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    let seenUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seenUrl = typeof input === "string" ? input : input.toString();
      return new Response(
        JSON.stringify([
          {
            jsonrpc: "2.0",
            id: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:balance",
            result: { value: 2_000_000_000 },
          },
          {
            jsonrpc: "2.0",
            id: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:spl",
            result: { value: [] },
          },
          {
            jsonrpc: "2.0",
            id: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:token2022",
            result: { value: [] },
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    const action = createGetWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        wallets: ["wallet_000"],
        includeZeroBalances: false,
      },
    );

    expect(result.ok).toBe(true);
    expect(seenUrl).toBe("https://mainnet.helius-rpc.com/?api-key=test-helius-key");
  });

  test("falls back to sequential RPC when batch requests are not allowed on the provider plan", async () => {
    const instanceId = "72";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      JSON.stringify({
        walletId: "core-wallets.wallet_000",
        walletGroup: "core-wallets",
        walletName: "wallet_000",
        address: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1",
        keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
        walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
      }),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    let requestCount = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = parseRpcBody(init);
      requestCount += 1;
      if (Array.isArray(body) && body.length > 1) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32403,
              message: "Batch requests are only available for paid plans. Please upgrade if you would like to gain access",
            },
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        );
      }

      const request = expectSingleRpcRequest(body);
      const responses: Record<string, unknown> = {
        "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:balance": {
          jsonrpc: "2.0",
          id: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:balance",
          result: { value: 2_000_000_000 },
        },
        "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:spl": {
          jsonrpc: "2.0",
          id: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:spl",
          result: { value: [] },
        },
        "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:token2022": {
          jsonrpc: "2.0",
          id: "4Yx6R5aLho3n6vfg8VgA4dpoPfxVJr2f4U1F7tW8fgH1:token2022",
          result: { value: [] },
        },
      };

      return new Response(JSON.stringify(responses[request.id]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await writeWalletBatchSetting(instanceId, true);
    const action = createGetWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://mainnet.helius-rpc.com/?api-key=test-key",
      }),
      {
        wallets: ["wallet_000"],
        includeZeroBalances: false,
      },
    );

    expect(result.ok).toBe(true);
    expect(requestCount).toBeGreaterThan(1);
    const payload = result.data as {
      dataSource: string;
      wallets: Array<{ walletName: string; balanceLamports: string }>;
      warnings: Array<{ code: string }>;
    };
    expect(payload.dataSource).toBe("rpc-sequential");
    expect(payload.warnings).toEqual([
      expect.objectContaining({
        code: "RPC_SEQUENTIAL_FALLBACK",
      }),
    ]);
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletName: "wallet_000",
        balanceLamports: "2000000000",
      }),
    ]);
  });

  test("reuses cached wallet balances for repeated getWalletContents reads", async () => {
    const instanceId = "83";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      JSON.stringify({
        walletId: "core-wallets.wallet_000",
        walletGroup: "core-wallets",
        walletName: "wallet_000",
        address: "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF",
        keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
        walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
      }),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    let requestCount = 0;
    globalThis.fetch = (async () => {
      requestCount += 1;
      return new Response(
        JSON.stringify([
          {
            jsonrpc: "2.0",
            id: "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF:balance",
            result: { value: 500_000_000 },
          },
          {
            jsonrpc: "2.0",
            id: "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF:spl",
            result: { value: [] },
          },
          {
            jsonrpc: "2.0",
            id: "9xQeWvG816bUx9EPfK5Yw9s6o1tuVd7a3mZ9zNnV3xF:token2022",
            result: { value: [] },
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const action = createGetWalletContentsAction();
    const firstResult = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        wallets: ["wallet_000"],
        includeZeroBalances: false,
      },
    );
    const secondResult = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        wallets: ["wallet_000"],
        includeZeroBalances: false,
      },
    );

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    expect(requestCount).toBe(3);
  });

  test("falls back only the failed wallet chunk entries for getWalletContents", async () => {
    const instanceId = "84";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });

    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      [
        JSON.stringify({
          walletId: "core-wallets.wallet_000",
          walletGroup: "core-wallets",
          walletName: "wallet_000",
          address: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_000.label.json"),
        }),
        JSON.stringify({
          walletId: "core-wallets.wallet_001",
          walletGroup: "core-wallets",
          walletName: "wallet_001",
          address: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9",
          keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.json"),
          walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/wallet_001.label.json"),
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    let requestCount = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = parseRpcBody(init);
      requestCount += 1;
      if (Array.isArray(body) && body.length > 3) {
        return new Response(
          JSON.stringify([
            {
              jsonrpc: "2.0",
              id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:balance",
              result: { value: 40_010_000 },
            },
            {
              jsonrpc: "2.0",
              id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:spl",
              result: { value: [] },
            },
            {
              jsonrpc: "2.0",
              id: "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU:token2022",
              result: { value: [] },
            },
            {
              jsonrpc: "2.0",
              id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:spl",
              error: { code: 429, message: "Too many requests" },
            },
            {
              jsonrpc: "2.0",
              id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:balance",
              result: { value: 11_000_000 },
            },
            {
              jsonrpc: "2.0",
              id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:token2022",
              result: { value: [] },
            },
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      const request = expectSingleRpcRequest(body);
      const responses: Record<string, unknown> = {
        "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:balance": {
          jsonrpc: "2.0",
          id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:balance",
          result: { value: 11_000_000 },
        },
        "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:spl": {
          jsonrpc: "2.0",
          id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:spl",
          result: { value: [] },
        },
        "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:token2022": {
          jsonrpc: "2.0",
          id: "3B7c1TwdECT9WRBCPieNQqed3JqmZJTZuhVNikMG5yj9:token2022",
          result: { value: [] },
        },
      };

      return new Response(JSON.stringify(responses[request.id]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await writeWalletBatchSetting(instanceId, true);
    const action = createGetWalletContentsAction();
    const result = await action.execute(
      createActionContext({
        actor: "agent",
        rpcUrl: "https://rpc.example.test",
      }),
      {
        includeZeroBalances: false,
      },
    );

    expect(result.ok).toBe(true);
    expect(requestCount).toBeGreaterThan(1);
    const payload = result.data as {
      dataSource: string;
      warnings: Array<{ code: string }>;
      wallets: Array<{ walletName: string; balanceLamports: string }>;
    };
    expect(payload.dataSource).toBe("rpc-sequential");
    expect(payload.warnings).toEqual([
      expect.objectContaining({
        code: "RPC_SEQUENTIAL_FALLBACK",
      }),
    ]);
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletName: "wallet_000",
        balanceLamports: "40010000",
      }),
      expect.objectContaining({
        walletName: "wallet_001",
        balanceLamports: "11000000",
      }),
    ]);
  });
});
