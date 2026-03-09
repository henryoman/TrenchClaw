import { describe, expect, test } from "bun:test";

import { createWalletsRoutine } from "../../../apps/trenchclaw/src/solana/routines/create-wallets";

describe("createWalletsRoutine", () => {
  test("builds flat wallet-group creation steps and rename step", async () => {
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

    expect(steps).toHaveLength(3);

    expect(steps[0]?.actionName).toBe("createWallets");
    const firstInput = steps[0]?.input as {
      count?: number;
      walletNames?: string[];
      storage?: { walletGroup?: string };
    };
    expect(firstInput.count).toBe(1);
    expect(firstInput.walletNames).toEqual(["maker"]);
    expect(firstInput.storage?.walletGroup).toBe("core-wallets");

    expect(steps[1]?.actionName).toBe("createWallets");
    const secondInput = steps[1]?.input as {
      count?: number;
      storage?: { walletGroup?: string };
      output?: { filePrefix?: string; startIndex?: number };
    };
    expect(secondInput.count).toBe(2);
    expect(secondInput.storage?.walletGroup).toBe("snipers");
    expect(secondInput.output?.filePrefix).toBe("s");
    expect(secondInput.output?.startIndex).toBe(5);

    expect(steps[2]?.actionName).toBe("renameWallets");
    const thirdInput = steps[2]?.input as {
      walletGroup?: string;
      renames?: Array<{ fromWalletName: string; toWalletName: string }>;
    };
    expect(thirdInput.walletGroup).toBe("core-wallets");
    expect(thirdInput.renames?.[0]).toEqual({ fromWalletName: "maker", toWalletName: "makerMain" });
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
