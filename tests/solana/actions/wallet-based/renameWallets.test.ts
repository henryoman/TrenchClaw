import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";
import { renameWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/renameWallets";
import { coreAppPath } from "../../../helpers/core-paths";

const createdPaths = new Set<string>();
const previousWalletLibraryPath = process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const TEST_INSTANCE_ID = "i-test-rename-wallets";

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

describe("renameWalletsAction", () => {
  test("renames wallet metadata in the library and updates the colocated wallet label file", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletGroup = `core-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join("src/ai/brain/protected", `test-rename-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(coreAppPath("src/ai/brain/protected/instance"), TEST_INSTANCE_ID));
    createdPaths.add(path.join(coreAppPath(), walletLibraryFile));

    const createResult = await createWalletsAction.execute({} as never, {
      count: 1,
      walletName: "wallet001",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
      },
      output: {
        filePrefix: "wallet",
        startIndex: 1,
        includeIndexInFileName: true,
      },
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) {
      return;
    }

    const createData = createResult.data;
    expect(createData).toBeDefined();
    if (!createData) {
      return;
    }

    const keypairFile = createData.files[0] ?? "";
    const originalKeypairText = await Bun.file(keypairFile).text();

    const renameResult = await renameWalletsAction.execute({} as never, {
      walletGroup,
      renames: [{ fromWalletName: "wallet001", toWalletName: "wallet-main" }],
      updateKeypairFiles: true,
    });

    expect(renameResult.ok).toBe(true);
    if (!renameResult.ok) {
      return;
    }

    const renameData = renameResult.data;
    expect(renameData).toBeDefined();
    if (!renameData) {
      return;
    }

    const libraryLines = (await Bun.file(renameData.walletLibraryFilePath).text())
      .trim()
      .split("\n")
      .filter(Boolean);

    expect(libraryLines).toHaveLength(1);
    const updatedEntry = JSON.parse(libraryLines[0] ?? "{}");
    expect(updatedEntry.walletId).toBe(`${walletGroup}.wallet-main`);
    expect(updatedEntry.walletGroup).toBe(walletGroup);
    expect(updatedEntry.walletName).toBe("wallet-main");

    const keypairJson = JSON.parse(originalKeypairText);
    expect(Array.isArray(keypairJson)).toBe(true);
    expect(keypairJson).toHaveLength(64);
    expect(await Bun.file(keypairFile).text()).toBe(originalKeypairText);

    expect(typeof updatedEntry.walletLabelFilePath).toBe("string");
    const walletLabelJson = await Bun.file(updatedEntry.walletLabelFilePath).json();
    expect(walletLabelJson.walletId).toBe(`${walletGroup}.wallet-main`);
    expect(walletLabelJson.walletGroup).toBe(walletGroup);
    expect(walletLabelJson.walletName).toBe("wallet-main");
  });

  test("rejects rename when target wallet name already exists", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletGroup = `uploaded-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join("src/ai/brain/protected", `test-rename-conflict-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(coreAppPath("src/ai/brain/protected/instance"), TEST_INSTANCE_ID));
    createdPaths.add(path.join(coreAppPath(), walletLibraryFile));

    await createWalletsAction.execute({} as never, {
      count: 1,
      walletName: "one",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
      },
      output: {
        filePrefix: "wallet",
        startIndex: 1,
        includeIndexInFileName: true,
      },
    });

    await createWalletsAction.execute({} as never, {
      count: 1,
      walletName: "two",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
      },
      output: {
        filePrefix: "wallet",
        startIndex: 1,
        includeIndexInFileName: true,
      },
    });

    const renameResult = await renameWalletsAction.execute({} as never, {
      walletGroup,
      updateKeypairFiles: true,
      renames: [{ fromWalletName: "one", toWalletName: "two" }],
    });

    expect(renameResult.ok).toBe(false);
    if (renameResult.ok) {
      return;
    }

    expect(renameResult.error).toContain("target already exists");
  });
});
