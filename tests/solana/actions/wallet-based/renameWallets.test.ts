import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";
import { renameWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/renameWallets";

const createdPaths = new Set<string>();

afterEach(async () => {
  for (const targetPath of createdPaths) {
    await rm(targetPath, { recursive: true, force: true });
  }
  createdPaths.clear();
});

describe("renameWalletsAction", () => {
  test("renames walletPath in library and updates keypair walletPath", async () => {
    const scopeName = `test-rename-wallets-${crypto.randomUUID()}`;
    const directory = path.join("src/ai/brain/protected", scopeName, "keypairs");
    const walletLibraryFile = path.join("src/ai/brain/protected", scopeName, "wallet-library.jsonl");
    const scopeRoot = path.join(process.cwd(), "src/ai/brain/protected", scopeName);
    createdPaths.add(scopeRoot);

    const createResult = await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: true,
      privateKeyEncoding: "base64",
      walletPath: "ops.wallet001",
      walletLocator: {
        group: "ops",
        startIndex: 1,
      },
      output: {
        directory,
        filePrefix: "wallet",
        includeIndexInFileName: true,
        walletLibraryFile,
      },
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) {
      return;
    }

    const renameResult = await renameWalletsAction.execute({} as never, {
      walletLibraryFile,
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
    const scopeName = `test-rename-wallets-conflict-${crypto.randomUUID()}`;
    const directory = path.join("src/ai/brain/protected", scopeName, "keypairs");
    const walletLibraryFile = path.join("src/ai/brain/protected", scopeName, "wallet-library.jsonl");
    const scopeRoot = path.join(process.cwd(), "src/ai/brain/protected", scopeName);
    createdPaths.add(scopeRoot);

    await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: true,
      privateKeyEncoding: "base64",
      walletPath: "ops.one",
      walletLocator: {
        group: "ops",
        startIndex: 1,
      },
      output: {
        directory,
        filePrefix: "wallet",
        includeIndexInFileName: true,
        walletLibraryFile,
      },
    });

    await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: true,
      privateKeyEncoding: "base64",
      walletPath: "ops.two",
      walletLocator: {
        group: "ops",
        startIndex: 1,
      },
      output: {
        directory,
        filePrefix: "wallet",
        includeIndexInFileName: true,
        walletLibraryFile,
      },
    });

    const renameResult = await renameWalletsAction.execute({} as never, {
      walletLibraryFile,
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
