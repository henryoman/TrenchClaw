import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/tools/wallet/create/createWallets";
import { transferAction } from "../../../../apps/trenchclaw/src/tools/wallet/transfer/transfer";
import { createPersistedTestInstance } from "../../../helpers/instanceFixtures";
import { runtimeStatePath } from "../../../helpers/corePaths";

const createdPaths = new Set<string>();
const previousWalletLibraryPath = process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const TEST_INSTANCE_ID = "93";

afterEach(async () => {
  if (previousWalletLibraryPath === undefined) {
    delete process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;
  } else {
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = previousWalletLibraryPath;
  }
  if (previousActiveInstanceId === undefined) {
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
  } else {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
  }
  for (const targetPath of createdPaths) {
    await rm(targetPath, { recursive: true, force: true });
  }
  createdPaths.clear();
});

describe("transferAction", () => {
  test("requires walletGroup and walletName together", () => {
    expect(transferAction.inputSchema?.safeParse({
      destination: "target",
      amount: 1,
      walletGroup: "core-wallets",
    }).success).toBe(false);
  });

  test("accepts plain-decimal string amounts for tool-style transfer calls", () => {
    expect(transferAction.inputSchema?.safeParse({
      destination: "target",
      amount: "0.000000001",
    }).success).toBe(true);
  });

  test("returns a signer error when neither a context signer nor managed wallet is provided", async () => {
    const result = await transferAction.execute({} as never, {
      destination: "target",
      amount: "0.1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("TRANSFER_FAILED");
    expect(result.error).toContain("Provide ctx.ultraSigner or a managed wallet selector");
  });

  test("uses managed wallet signers when wallet is provided as a simple name", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletLibraryFile = runtimeStatePath("instances", TEST_INSTANCE_ID, `test-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    const instanceRoot = await createPersistedTestInstance(TEST_INSTANCE_ID);
    createdPaths.add(instanceRoot);

    const created = await createWalletsAction.execute({} as never, {
      groups: [
        {
          walletGroup: "core-wallets",
          walletNames: ["wallet_000"],
        },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const result = await transferAction.execute({} as never, {
      wallet: "wallet_000",
      destination: created.data?.wallets[0]?.address ?? "target",
      amount: "0.001",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("RPC URL is required");
  });
});
