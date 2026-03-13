import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";
import { loadManagedWalletSigner } from "../../../apps/trenchclaw/src/solana/lib/wallet/wallet-signer";
import { runtimeStatePath } from "../../helpers/core-paths";

const createdPaths = new Set<string>();
const previousWalletLibraryPath = process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const TEST_INSTANCE_ID = "92";

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

describe("loadManagedWalletSigner", () => {
  test("loads signers from 64-byte managed wallet keypair files", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletLibraryFile = path.join(".runtime-state", "instances", TEST_INSTANCE_ID, `test-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(runtimeStatePath("instances"), TEST_INSTANCE_ID));

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

    const signer = await loadManagedWalletSigner({
      walletGroup: "core-wallets",
      walletName: "wallet_000",
      rpcUrl: "http://127.0.0.1:8899",
    });

    const createdAddress = created.data?.wallets[0]?.address;
    expect(createdAddress).toBeDefined();
    if (!createdAddress) {
      return;
    }

    expect(signer.address).toBe(createdAddress);
    expect(typeof signer.signBase64Transaction).toBe("function");
  });
});
