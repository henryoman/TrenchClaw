import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import { createGetManagedWalletContentsAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/getManagedWalletContents";
import { runtimeStatePath } from "../../../helpers/core-paths";

const RUNTIME_INSTANCE_DIRECTORY = runtimeStatePath("instances");
const tempInstanceDirectories: string[] = [];
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const previousFetch = globalThis.fetch;

afterEach(async () => {
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
  test("discovers managed wallets from label files and returns SOL plus token balances", async () => {
    const instanceId = "97";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const walletGroupDirectory = path.join(instanceDirectory, "keypairs", "core");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(walletGroupDirectory, { recursive: true });

    await writeFile(path.join(walletGroupDirectory, "wallet_000.json"), "[1,2,3]\n", "utf8");
    await writeFile(
      path.join(walletGroupDirectory, "wallet_000.label.json"),
      `${JSON.stringify({
        version: 1,
        walletId: "practice-wallets.practice001",
        walletGroup: "practice-wallets",
        walletName: "practice001",
        walletFileName: "wallet_000.json",
        address: "DhUmVgNRRerCSzMBYseakf1hvVCqhKjd6XGgQzxSsAB5",
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      })}\n`,
      "utf8",
    );
    await writeFile(path.join(walletGroupDirectory, "wallet_001.json"), "[4,5,6]\n", "utf8");
    await writeFile(
      path.join(walletGroupDirectory, "wallet_001.label.json"),
      `${JSON.stringify({
        version: 1,
        walletId: "practice-wallets.practice002",
        walletGroup: "practice-wallets",
        walletName: "practice002",
        walletFileName: "wallet_001.json",
        address: "2npaXAjxDnQSht8nPMAdw27HbnYQfS4GZMfEmMuMXFXq",
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      })}\n`,
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    const action = createGetManagedWalletContentsAction({
      loadWalletContents: async ({ address }) => ({
        lamports:
          address === "DhUmVgNRRerCSzMBYseakf1hvVCqhKjd6XGgQzxSsAB5"
            ? 1_500_000_000n
            : 250_000_000n,
        tokenBalances:
          address === "DhUmVgNRRerCSzMBYseakf1hvVCqhKjd6XGgQzxSsAB5"
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
      walletGroup: "practice-wallets",
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
    expect(payload.walletCount).toBe(2);
    expect(payload.discoveredVia).toBe("label-files");
    expect(payload.wallets).toEqual([
      expect.objectContaining({
        walletId: "practice-wallets.practice001",
        walletGroup: "practice-wallets",
        walletName: "practice001",
        address: "DhUmVgNRRerCSzMBYseakf1hvVCqhKjd6XGgQzxSsAB5",
        balanceLamports: "1500000000",
        balanceSol: 1.5,
        tokenCount: 2,
        tokenBalances: [
          expect.objectContaining({
            mintAddress: "So11111111111111111111111111111111111111112",
            tokenProgram: "spl-token",
            balanceRaw: "1500000",
            balanceUiString: "1.5",
          }),
          expect.objectContaining({
            mintAddress: "TokenMint22222222222222222222222222222222222",
            tokenProgram: "token-2022",
            balanceRaw: "42",
            balanceUiString: "42",
          }),
        ],
      }),
      expect.objectContaining({
        walletId: "practice-wallets.practice002",
        walletGroup: "practice-wallets",
        walletName: "practice002",
        address: "2npaXAjxDnQSht8nPMAdw27HbnYQfS4GZMfEmMuMXFXq",
        balanceLamports: "250000000",
        balanceSol: 0.25,
        tokenCount: 1,
        tokenBalances: [
          expect.objectContaining({
            mintAddress: "So11111111111111111111111111111111111111112",
            tokenProgram: "spl-token",
            balanceRaw: "250000",
            balanceUiString: "0.25",
          }),
        ],
      }),
    ]);
    expect(payload.totalBalanceLamports).toBe("1750000000");
    expect(payload.totalBalanceSol).toBe(1.75);
    expect(payload.tokenTotals).toEqual([
      expect.objectContaining({
        mintAddress: "So11111111111111111111111111111111111111112",
        tokenProgram: "spl-token",
        balanceRaw: "1750000",
        balanceUiString: "1.75",
        walletCount: 2,
      }),
      expect.objectContaining({
        mintAddress: "TokenMint22222222222222222222222222222222222",
        tokenProgram: "token-2022",
        balanceRaw: "42",
        balanceUiString: "42",
        walletCount: 1,
      }),
    ]);
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
});
