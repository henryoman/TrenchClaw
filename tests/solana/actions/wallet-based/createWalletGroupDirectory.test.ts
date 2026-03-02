import { afterEach, describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletGroupDirectoryAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWalletGroupDirectory";

const createdPaths = new Set<string>();

afterEach(async () => {
  for (const targetPath of createdPaths) {
    await rm(targetPath, { recursive: true, force: true });
  }
  createdPaths.clear();
});

describe("createWalletGroupDirectoryAction", () => {
  test("creates group directories under protected keypairs root", async () => {
    const walletGroup = `uploaded-wallets-${crypto.randomUUID()}`;
    const expectedPath = path.join(process.cwd(), "apps/trenchclaw/src/ai/brain/protected/keypairs", walletGroup);

    const result = await createWalletGroupDirectoryAction.execute({} as never, { walletGroup });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const createdDirectoryPath = result.data?.directoryPath ?? expectedPath;
    createdPaths.add(createdDirectoryPath);
    expect(result.data?.walletGroup).toBe(walletGroup);
    expect(createdDirectoryPath.endsWith(`/keypairs/${walletGroup}`)).toBe(true);
    expect((await stat(createdDirectoryPath)).isDirectory()).toBe(true);
  });

  test("rejects invalid group names", async () => {
    const result = await createWalletGroupDirectoryAction.execute({} as never, {
      walletGroup: "../escape",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("Invalid");
  });
});
