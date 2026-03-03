import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";
import { coreAppPath } from "../../../helpers/core-paths";

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

describe("createWalletsAction", () => {
  test("creates wallets inside the selected wallet group directory and appends library metadata", async () => {
    const walletGroup = `core-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join("src/ai/brain/protected", `test-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(coreAppPath("src/ai/brain/protected/keypairs"), walletGroup));
    createdPaths.add(path.join(coreAppPath(), walletLibraryFile));

    const result = await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: true,
      privateKeyEncoding: "base64",
      walletPath: "group1.wallet001",
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const data = result.data;
    expect(data).toBeDefined();
    if (!data) {
      return;
    }

    expect(data.wallets).toHaveLength(1);
    expect(data.wallets[0]?.walletPath).toBe("group1.wallet001");
    expect(data.wallets[0]).not.toHaveProperty("privateKey");
    expect(data.walletGroup).toBe(walletGroup);
    expect(data.outputDirectory).toContain(`/keypairs/${walletGroup}`);

    const libraryLines = (await Bun.file(data.walletLibraryFilePath).text())
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(libraryLines).toHaveLength(1);

    const libraryEntry = JSON.parse(libraryLines[0] ?? "{}");
    expect(libraryEntry.walletPath).toBe("group1.wallet001");
    expect(typeof libraryEntry.keypairFilePath).toBe("string");
    expect(libraryEntry.walletGroup).toBe(walletGroup);

    const keypairJson = await Bun.file(data.files[0] ?? "").json();
    expect(keypairJson.walletPath).toBe("group1.wallet001");
    expect(typeof keypairJson.privateKey).toBe("string");
  });

  test("rejects invalid wallet group names", async () => {
    const result = await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: false,
      privateKeyEncoding: "base64",
      storage: {
        walletGroup: "../uploaded-wallets",
        createGroupIfMissing: true,
        keypairGenerator: "bun",
      },
      walletLocator: {
        group: "tmp",
        startIndex: 1,
      },
      output: {
        filePrefix: "wallet",
        includeIndexInFileName: true,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("Invalid");
  });
});
