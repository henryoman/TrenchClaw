import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createActionContext } from "../../../../apps/trenchclaw/src/ai/runtime/types/context";
import { createGetManagedWalletSolBalancesAction } from "../../../../apps/trenchclaw/src/solana/actions/data-fetch/runtime/getManagedWalletSolBalances";
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

describe("getManagedWalletSolBalancesAction", () => {
  test("discovers managed wallets from label files when wallet-library.jsonl is missing", async () => {
    const instanceId = "96";
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

    const action = createGetManagedWalletSolBalancesAction({
      loadBalance: async ({ address }) => ({
        lamports:
          address === "DhUmVgNRRerCSzMBYseakf1hvVCqhKjd6XGgQzxSsAB5"
            ? 1_500_000_000n
            : 250_000_000n,
      }),
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      walletGroup: "practice-wallets",
    });

    expect(result.ok).toBe(true);
    const payload = result.data as {
      instanceId: string;
      walletCount: number;
      discoveredVia: string;
      wallets: Array<{
        walletName: string;
        address: string;
        balanceLamports: string;
        balanceSol: number;
      }>;
      totalBalanceLamports: string;
      totalBalanceSol: number;
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
      }),
      expect.objectContaining({
        walletId: "practice-wallets.practice002",
        walletGroup: "practice-wallets",
        walletName: "practice002",
        address: "2npaXAjxDnQSht8nPMAdw27HbnYQfS4GZMfEmMuMXFXq",
        balanceLamports: "250000000",
        balanceSol: 0.25,
      }),
    ]);
    expect(payload.totalBalanceLamports).toBe("1750000000");
    expect(payload.totalBalanceSol).toBe(1.75);
  });
});
