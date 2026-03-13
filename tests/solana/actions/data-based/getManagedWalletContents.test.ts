import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import { createGetManagedWalletContentsAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/getManagedWalletContents";
import { runtimeStatePath } from "../../../helpers/core-paths";

const RUNTIME_INSTANCE_DIRECTORY = runtimeStatePath("instances");
const tempInstanceDirectories: string[] = [];
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;

afterEach(async () => {
  for (const directoryPath of tempInstanceDirectories.splice(0)) {
    await rm(directoryPath, { recursive: true, force: true }).catch(() => {});
  }
  if (previousActiveInstanceId === undefined) {
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
  } else {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
  }
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
});
