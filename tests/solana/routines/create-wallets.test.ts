import { describe, expect, test } from "bun:test";

import { createWalletsRoutine } from "../../../apps/trenchclaw/src/solana/routines/create-wallets";

describe("createWalletsRoutine", () => {
  test("builds nested group wallet creation steps and rename step", async () => {
    const steps = await createWalletsRoutine({} as never, {
      id: "job-1",
      botId: "bot-1",
      routineName: "createWallets",
      status: "pending",
      config: {
        includePrivateKey: false,
        privateKeyEncoding: "base64",
        output: {
          directory: "src/ai/brain/protected/keypairs",
          filePrefix: "wallet",
          includeIndexInFileName: true,
          walletLibraryFile: "src/ai/brain/protected/wallet-library.jsonl",
        },
        groups: [
          {
            name: "core",
            wallets: [{ name: "maker" }],
            children: [
              {
                name: "snipers",
                count: 2,
                startIndex: 5,
                filePrefix: "s",
              },
            ],
          },
        ],
        renames: [{ from: "core.maker", to: "core.makerMain" }],
      },
      cyclesCompleted: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(steps).toHaveLength(3);

    expect(steps[0]?.actionName).toBe("createWallets");
    expect((steps[0]?.input as Record<string, unknown>)?.walletPath).toBe("core.maker");

    expect(steps[1]?.actionName).toBe("createWallets");
    const secondInput = steps[1]?.input as {
      count?: number;
      walletLocator?: { group?: string; startIndex?: number };
      output?: { filePrefix?: string };
    };
    expect(secondInput.count).toBe(2);
    expect(secondInput.walletLocator?.group).toBe("core_snipers");
    expect(secondInput.walletLocator?.startIndex).toBe(5);
    expect(secondInput.output?.filePrefix).toBe("s");

    expect(steps[2]?.actionName).toBe("renameWallets");
    const thirdInput = steps[2]?.input as { renames?: Array<{ from: string; to: string }> };
    expect(thirdInput.renames?.[0]).toEqual({ from: "core.maker", to: "core.makerMain" });
  });

  test("preserves legacy single-step behavior when groups are omitted", async () => {
    const steps = await createWalletsRoutine({} as never, {
      id: "job-legacy",
      botId: "bot-legacy",
      routineName: "createWallets",
      status: "pending",
      config: {
        count: 2,
      },
      cyclesCompleted: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(steps).toHaveLength(1);
    expect(steps[0]?.actionName).toBe("createWallets");

    const input = steps[0]?.input as { count?: number };
    expect(input.count).toBe(2);
  });
});
