import { describe, expect, test } from "bun:test";

import { createWalletsRoutine } from "../../../apps/trenchclaw/src/solana/routines/create-wallets";

describe("createWalletsRoutine", () => {
  test("builds one batch wallet creation step and rename step", async () => {
    const steps = await createWalletsRoutine({} as never, {
      id: "job-1",
      botId: "bot-1",
      routineName: "createWallets",
      status: "pending",
      config: {
        storage: {
          walletGroup: "core-wallets",
          createGroupIfMissing: true,
        },
        output: {
          filePrefix: "wallet",
          startIndex: 1,
          includeIndexInFileName: true,
        },
        walletGroups: [
          {
            name: "core-wallets",
            wallets: [{ name: "maker" }],
          },
          {
            name: "snipers",
            count: 2,
            startIndex: 5,
            filePrefix: "s",
          },
        ],
        renames: [{ walletGroup: "core-wallets", fromWalletName: "maker", toWalletName: "makerMain" }],
      },
      cyclesCompleted: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(steps).toHaveLength(2);

    expect(steps[0]?.actionName).toBe("createWallets");
    const firstInput = steps[0]?.input as {
      groups?: Array<{
        walletGroup: string;
        count?: number;
        walletNames?: string[];
      }>;
    };
    expect(firstInput.groups).toEqual([
      {
        walletGroup: "core-wallets",
        walletNames: ["maker"],
      },
      {
        walletGroup: "snipers",
        count: 2,
      },
    ]);

    expect(steps[1]?.actionName).toBe("renameWallets");
    const secondInput = steps[1]?.input as {
      edits?: Array<{
        current: { walletGroup: string; walletName: string };
        next: { walletGroup: string; walletName: string };
      }>;
    };
    expect(secondInput.edits?.[0]).toEqual({
      current: { walletGroup: "core-wallets", walletName: "maker" },
      next: { walletGroup: "core-wallets", walletName: "makerMain" },
    });
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
