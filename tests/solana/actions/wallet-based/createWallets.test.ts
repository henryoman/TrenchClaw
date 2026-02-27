import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";

const createdPaths = new Set<string>();

afterEach(async () => {
  for (const targetPath of createdPaths) {
    await rm(targetPath, { recursive: true, force: true });
  }
  createdPaths.clear();
});

describe("createWalletsAction", () => {
  test("accepts JSON config and appends wallet metadata into protected wallet library", async () => {
    const scopeName = `test-wallets-${crypto.randomUUID()}`;
    const directory = path.join("src/ai/brain/protected", scopeName, "keypairs");
    const walletLibraryFile = path.join("src/ai/brain/protected", scopeName, "wallet-library.jsonl");
    createdPaths.add(path.join(process.cwd(), "apps/trenchclaw/src/ai/brain/protected", scopeName));

    const result = await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: true,
      privateKeyEncoding: "base64",
      walletPath: "group1.wallet001",
      walletLocator: {
        group: "group1",
        startIndex: 1,
      },
      output: {
        directory,
        filePrefix: "wallet",
        includeIndexInFileName: true,
        walletLibraryFile,
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

    const libraryLines = (await Bun.file(data.walletLibraryFilePath).text())
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(libraryLines).toHaveLength(1);

    const libraryEntry = JSON.parse(libraryLines[0] ?? "{}");
    expect(libraryEntry.walletPath).toBe("group1.wallet001");
    expect(typeof libraryEntry.keypairFilePath).toBe("string");

    const keypairJson = await Bun.file(data.files[0] ?? "").json();
    expect(keypairJson.walletPath).toBe("group1.wallet001");
    expect(typeof keypairJson.privateKey).toBe("string");
  });

  test("rejects writing wallet artifacts outside protected directory", async () => {
    const result = await createWalletsAction.execute({} as never, {
      count: 1,
      includePrivateKey: false,
      privateKeyEncoding: "base64",
      walletLocator: {
        group: "tmp",
        startIndex: 1,
      },
      output: {
        directory: "./tmp/outside-protected",
        filePrefix: "wallet",
        includeIndexInFileName: true,
        walletLibraryFile: "./tmp/outside-protected/wallet-library.jsonl",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("Protected writes must stay under");
  });
});
