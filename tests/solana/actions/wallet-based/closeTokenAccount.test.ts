import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";
import { closeTokenAccountAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/transfer/closeTokenAccount";
import { createPersistedTestInstance } from "../../../helpers/instance-fixtures";
import { runtimeStatePath } from "../../../helpers/core-paths";

const createdPaths = new Set<string>();
const previousWalletLibraryPath = process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const TEST_INSTANCE_ID = "94";

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

describe("closeTokenAccountAction", () => {
  test("requires walletGroup and walletName together", () => {
    expect(closeTokenAccountAction.inputSchema?.safeParse({
      walletGroup: "core-wallets",
      mintAddress: "mint",
    }).success).toBe(false);
  });

  test("requires mintAddress or tokenAccountAddress", () => {
    expect(closeTokenAccountAction.inputSchema?.safeParse({
      walletGroup: "core-wallets",
      walletName: "wallet_000",
    }).success).toBe(false);
  });

  test("returns a signer error when neither a context signer nor managed wallet is provided", async () => {
    const result = await closeTokenAccountAction.execute({} as never, {
      mintAddress: "mint",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("CLOSE_TOKEN_ACCOUNT_FAILED");
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

    const result = await closeTokenAccountAction.execute({} as never, {
      wallet: "wallet_000",
      mintAddress: "CxWPdDBqxVo3fnTMRTvNuSrd4gkp78udSrFvkVDBAGS",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("RPC URL is required");
  });
});
