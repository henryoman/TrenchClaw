import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";
import { renameWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/renameWallets";
import { runtimeStatePath } from "../../../helpers/core-paths";

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

describe("renameWalletsAction", () => {
  test("updates wallet name/group metadata in the library and updates the colocated wallet label file", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletGroup = `core-wallets-${crypto.randomUUID()}`;
    const renamedWalletGroup = `ops-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join(".runtime-state", "instances", TEST_INSTANCE_ID, `test-rename-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(runtimeStatePath("instances"), TEST_INSTANCE_ID));

    const createResult = await createWalletsAction.execute({} as never, {
      count: 1,
      walletName: "one",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
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
      edits: [
        {
          current: {
            walletGroup,
            walletName: "one",
          },
          next: {
            walletGroup: renamedWalletGroup,
            walletName: "main",
          },
        },
      ],
      updateLabelFiles: true,
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
    expect(updatedEntry.walletId).toBe(`${renamedWalletGroup}.main`);
    expect(updatedEntry.walletGroup).toBe(renamedWalletGroup);
    expect(updatedEntry.walletName).toBe("main");

    const keypairJson = JSON.parse(originalKeypairText);
    expect(Array.isArray(keypairJson)).toBe(true);
    expect(keypairJson).toHaveLength(64);
    expect(await Bun.file(keypairFile).text()).toBe(originalKeypairText);

    expect(typeof updatedEntry.walletLabelFilePath).toBe("string");
    const walletLabelJson = await Bun.file(updatedEntry.walletLabelFilePath).json();
    expect(walletLabelJson.walletId).toBe(`${renamedWalletGroup}.main`);
    expect(walletLabelJson.walletGroup).toBe(renamedWalletGroup);
    expect(walletLabelJson.walletName).toBe("main");
  });

  test("rejects rename when target wallet name already exists", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletGroup = `uploaded-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join(".runtime-state", "instances", TEST_INSTANCE_ID, `test-rename-conflict-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(runtimeStatePath("instances"), TEST_INSTANCE_ID));

    await createWalletsAction.execute({} as never, {
      count: 1,
      walletName: "one",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
      },
    });

    await createWalletsAction.execute({} as never, {
      count: 1,
      walletName: "two",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
      },
    });

    const renameResult = await renameWalletsAction.execute({} as never, {
      edits: [
        {
          current: {
            walletGroup,
            walletName: "one",
          },
          next: {
            walletGroup,
            walletName: "two",
          },
        },
      ],
      updateLabelFiles: true,
    });

    expect(renameResult.ok).toBe(false);
    if (renameResult.ok) {
      return;
    }

    expect(renameResult.error).toContain("target already exists");
  });

  test("applies multiple rename edits in one batch and updates each label file", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletGroup = `batch-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join(".runtime-state", "instances", TEST_INSTANCE_ID, `test-rename-batch-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(runtimeStatePath("instances"), TEST_INSTANCE_ID));

    const createResult = await createWalletsAction.execute({} as never, {
      groups: [
        {
          walletGroup,
          walletNames: ["one", "two"],
        },
      ],
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) {
      return;
    }

    const renameResult = await renameWalletsAction.execute({} as never, {
      edits: [
        {
          current: {
            walletGroup,
            walletName: "one",
          },
          next: {
            walletGroup: "ops-wallets",
            walletName: "main",
          },
        },
        {
          current: {
            walletGroup,
            walletName: "two",
          },
          next: {
            walletGroup,
            walletName: "reserve",
          },
        },
      ],
      updateLabelFiles: true,
    });

    expect(renameResult.ok).toBe(true);
    if (!renameResult.ok) {
      return;
    }

    expect(renameResult.data?.updated).toHaveLength(2);

    const libraryLines = (await Bun.file(renameResult.data?.walletLibraryFilePath ?? "").text())
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { walletId: string; walletName: string; walletGroup: string; walletLabelFilePath: string });

    expect(libraryLines.map((entry) => entry.walletId).toSorted()).toEqual([
      `${walletGroup}.reserve`,
      "ops-wallets.main",
    ].toSorted());

    for (const updated of renameResult.data?.updated ?? []) {
      const walletLabel = await Bun.file(updated.walletLabelFilePath ?? "").json();
      expect(walletLabel.walletId).toBe(updated.next.walletId);
      expect(walletLabel.walletGroup).toBe(updated.next.walletGroup);
      expect(walletLabel.walletName).toBe(updated.next.walletName);
    }
  });
});
