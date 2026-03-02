import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";
import { renameWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/renameWallets";

const createdPaths = new Set<string>();
const previousWalletLibraryPath = process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;

afterEach(async () => {
  if (previousWalletLibraryPath === undefined) {
    delete process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;
  } else {
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = previousWalletLibraryPath;
  }
  for (const targetPath of createdPaths) {
    await rm(targetPath, { recursive: true, force: true });
  }
  createdPaths.clear();
});

describe("renameWalletsAction", () => {
  test("renames walletPath in library and updates keypair walletPath", async () => {
    const walletGroup = `core-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join("src/ai/brain/protected", `test-rename-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(process.cwd(), "apps/trenchclaw/src/ai/brain/protected/keypairs", walletGroup));
    createdPaths.add(path.join(process.cwd(), "apps/trenchclaw", walletLibraryFile));

    const createResult = await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: true,
      privateKeyEncoding: "base64",
      walletPath: "ops.wallet001",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
        keypairGenerator: "bun",
      },
      output: {
        filePrefix: "wallet",
        includeIndexInFileName: true,
      },
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) {
      return;
    }

    const renameResult = await renameWalletsAction.execute({} as never, {
      renames: [{ from: "ops.wallet001", to: "ops.wallet-main" }],
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
    expect(updatedEntry.walletPath).toBe("ops.wallet-main");
    expect(updatedEntry.group).toBe("ops");
    expect(updatedEntry.wallet).toBe("wallet-main");

    const createData = createResult.data;
    expect(createData).toBeDefined();
    if (!createData) {
      return;
    }

    const keypairFile = createData.files[0] ?? "";
    const keypairJson = await Bun.file(keypairFile).json();
    expect(keypairJson.walletPath).toBe("ops.wallet-main");
  });

  test("rejects rename when target walletPath already exists", async () => {
    const walletGroup = `uploaded-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join("src/ai/brain/protected", `test-rename-conflict-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(process.cwd(), "apps/trenchclaw/src/ai/brain/protected/keypairs", walletGroup));
    createdPaths.add(path.join(process.cwd(), "apps/trenchclaw", walletLibraryFile));

    await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: true,
      privateKeyEncoding: "base64",
      walletPath: "ops.one",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
        keypairGenerator: "bun",
      },
      output: {
        filePrefix: "wallet",
        includeIndexInFileName: true,
      },
    });

    await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: true,
      privateKeyEncoding: "base64",
      walletPath: "ops.two",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
        keypairGenerator: "bun",
      },
      output: {
        filePrefix: "wallet",
        includeIndexInFileName: true,
      },
    });

    const renameResult = await renameWalletsAction.execute({} as never, {
      updateKeypairFiles: true,
      renames: [{ from: "ops.one", to: "ops.two" }],
    });

    expect(renameResult.ok).toBe(false);
    if (renameResult.ok) {
      return;
    }

    expect(renameResult.error).toContain("target already exists");
  });
});
