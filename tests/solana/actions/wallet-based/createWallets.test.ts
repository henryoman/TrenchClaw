import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";
import { coreAppPath } from "../../../helpers/core-paths";

const createdPaths = new Set<string>();
const previousWalletLibraryPath = process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const TEST_INSTANCE_ID = "i-test-wallets";

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

describe("createWalletsAction", () => {
  test("creates wallets inside the selected wallet group directory and appends library metadata", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletGroup = `core-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join("src/ai/brain/protected", `test-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(coreAppPath("src/ai/brain/protected/instance"), TEST_INSTANCE_ID));
    createdPaths.add(path.join(coreAppPath(), walletLibraryFile));

    const result = await createWalletsAction.execute({} as never, {
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
    expect(data.wallets[0]?.walletId).toBe(`${walletGroup}.wallet001`);
    expect(data.wallets[0]?.walletGroup).toBe(walletGroup);
    expect(data.wallets[0]?.walletName).toBe("wallet001");
    expect(data.walletGroup).toBe(walletGroup);
    expect(data.outputDirectory).toContain(`/instance/${TEST_INSTANCE_ID}/keypairs/${walletGroup}`);

    const libraryLines = (await Bun.file(data.walletLibraryFilePath).text())
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(libraryLines).toHaveLength(1);

    const libraryEntry = JSON.parse(libraryLines[0] ?? "{}");
    expect(libraryEntry.walletId).toBe(`${walletGroup}.wallet001`);
    expect(libraryEntry.walletName).toBe("wallet001");
    expect(typeof libraryEntry.keypairFilePath).toBe("string");
    expect(typeof libraryEntry.walletLabelFilePath).toBe("string");
    expect(libraryEntry.walletGroup).toBe(walletGroup);

    const keypairJson = await Bun.file(data.files[0] ?? "").json();
    expect(Array.isArray(keypairJson)).toBe(true);
    expect(keypairJson).toHaveLength(64);

    const walletLabelJson = await Bun.file(libraryEntry.walletLabelFilePath).json();
    expect(walletLabelJson.walletId).toBe(`${walletGroup}.wallet001`);
    expect(walletLabelJson.walletGroup).toBe(walletGroup);
    expect(walletLabelJson.walletName).toBe("wallet001");
    expect(walletLabelJson.walletFileName).toBe(path.basename(data.files[0] ?? ""));
    expect(walletLabelJson.address).toBe(libraryEntry.address);
  });

  test("rejects invalid wallet group names", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const result = await createWalletsAction.execute({} as never, {
      count: 1,
      storage: {
        walletGroup: "../uploaded-wallets",
        createGroupIfMissing: true,
      },
      output: {
        filePrefix: "wallet",
        startIndex: 1,
        includeIndexInFileName: true,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("Invalid");
  });

  test("uses existing wallet group directory when createGroupIfMissing is false", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletGroup = `existing-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join("src/ai/brain/protected", `test-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    const walletGroupPath = path.join(coreAppPath("src/ai/brain/protected/instance"), TEST_INSTANCE_ID, "keypairs", walletGroup);
    await Bun.$`mkdir -p ${walletGroupPath}`.quiet();
    createdPaths.add(path.join(coreAppPath("src/ai/brain/protected/instance"), TEST_INSTANCE_ID));
    createdPaths.add(path.join(coreAppPath(), walletLibraryFile));

    const result = await createWalletsAction.execute({} as never, {
      count: 1,
      storage: {
        walletGroup,
        createGroupIfMissing: false,
      },
      output: {
        filePrefix: "wallet",
        startIndex: 1,
        includeIndexInFileName: true,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data?.wallets).toHaveLength(1);
    expect(result.data?.outputDirectory).toContain(`/instance/${TEST_INSTANCE_ID}/keypairs/${walletGroup}`);
  });
});
