import { describe, expect, test } from "bun:test";

import { createWalletsRoutine } from "../../../apps/trenchclaw/src/automation/routines/create-wallets";

describe("createWalletsRoutine", () => {
  test("builds one batch wallet creation step and rename step", async () => {
    const steps = await createWalletsRoutine({} as never, {
      id: "job-1",
      botId: "bot-1",
      routineName: "createWallets",
      status: "pending",
      config: {
        walletGroups: [
          {
            name: "core-wallets",
            wallets: [{ name: "one" }],
          },
          {
            name: "snipers",
            count: 2,
          },
        ],
        renames: [{ walletGroup: "core-wallets", fromWalletName: "one", toWalletName: "main" }],
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
        walletNames: ["one"],
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
      current: { walletGroup: "core-wallets", walletName: "one" },
      next: { walletGroup: "core-wallets", walletName: "main" },
    });
  });

});
