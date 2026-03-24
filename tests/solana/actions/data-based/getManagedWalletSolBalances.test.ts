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
  test("does not discover managed wallets from label files when wallet-library.jsonl is missing", async () => {
    const instanceId = "96";
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

    const action = createGetManagedWalletSolBalancesAction({
      loadBalance: async ({ address }) => ({
        lamports:
          address === "11111111111111111111111111111111"
            ? 1_500_000_000n
            : 250_000_000n,
      }),
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      walletGroup: "fixture-wallets",
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
    expect(payload.walletCount).toBe(0);
    expect(payload.discoveredVia).toBe("wallet-library");
    expect(payload.wallets).toEqual([]);
    expect(payload.totalBalanceLamports).toBe("0");
    expect(payload.totalBalanceSol).toBe(0);
  });

  test("selects specific wallets by wallet name selectors", async () => {
    const instanceId = "97";
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

    const action = createGetManagedWalletSolBalancesAction({
      loadBalance: async ({ address }) => ({
        lamports: address === "2gqBXk9VWimPKtin5Ks6286ToKp2cJzSKWcQEX3Fm9WU" ? 1_500_000_000n : 250_000_000n,
      }),
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      wallets: ["wallet_001"],
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
        balanceLamports: "250000000",
      }),
    ]);
    expect(payload.totalBalanceLamports).toBe("250000000");
  });

  test("falls back to walletGroup filters when a hallucinated selector includes an empty walletNames array", async () => {
    const instanceId = "98";
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

    const action = createGetManagedWalletSolBalancesAction({
      loadBalance: async ({ address }) => ({
        lamports: address === "BHyJ3Jv7L7Q4rqkof53MPhnpx4z7jpHRtENzL4Q4WwLX" ? 1_000_000_000n : 2_000_000_000n,
      }),
    });

    const result = await action.execute(createActionContext({ actor: "agent" }), {
      wallet: "core-wallets",
      wallets: [{ id: "core-wallets", group: "core-wallets", name: "all" }],
      walletGroup: "core-wallets",
      walletNames: [],
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
});
