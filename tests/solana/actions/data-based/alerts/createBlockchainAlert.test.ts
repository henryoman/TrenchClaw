import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";

import { createBlockchainAlertAction } from "../../../../../apps/trenchclaw/src/solana/actions/data-fetch/alerts/createBlockchainAlert";
import { createActionContext } from "../../../../../apps/trenchclaw/src/ai";
import { runtimeStatePath } from "../../../../helpers/core-paths";

const createdFiles: string[] = [];

afterEach(async () => {
  for (const filePath of createdFiles.splice(0)) {
    await Bun.$`rm -f ${filePath}`.quiet();
  }
});

describe("createBlockchainAlertAction", () => {
  test("creates and stores an alert rule", async () => {
    const storageFilePath = path.resolve(
      runtimeStatePath("runtime/workspace/strategies/.tests"),
      `alerts-${crypto.randomUUID()}.json`,
    );
    createdFiles.push(storageFilePath);

    const result = await createBlockchainAlertAction.execute(
      createActionContext({ actor: "agent" }),
      {
        chain: "solana",
        assetSymbol: "SOL",
        condition: {
          type: "priceAbove",
          threshold: 200,
        },
        notification: {
          channels: ["log"],
          cooldownMinutes: 10,
        },
        storageFilePath,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data?.alert.assetSymbol).toBe("SOL");
    expect(result.data?.alert.condition).toEqual({
      type: "priceAbove",
      threshold: 200,
    });

    const saved = JSON.parse(await Bun.file(storageFilePath).text()) as Array<{ assetSymbol: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.assetSymbol).toBe("SOL");
  });

  test("blocks writes outside manifest-allowed paths", async () => {
    const result = await createBlockchainAlertAction.execute(
      createActionContext({ actor: "agent" }),
      {
        chain: "solana",
        assetSymbol: "SOL",
        condition: {
          type: "priceAbove",
          threshold: 200,
        },
        notification: {
          channels: ["log"],
          cooldownMinutes: 10,
        },
        storageFilePath: `/tmp/trenchclaw-alert-${crypto.randomUUID()}.json`,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Blocked (read|write) blockchain alert storage file/);
  });
});
