import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createWalletsAction } from "../../../../apps/trenchclaw/src/solana/actions/wallet-based/create-wallets/createWallets";
import { runtimeStatePath } from "../../../helpers/core-paths";

const createdPaths = new Set<string>();
const previousWalletLibraryPath = process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
const TEST_INSTANCE_ID = "91";

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
  test("exposes only the batch wallet schema to chat tools", () => {
    expect(createWalletsAction.inputSchema?.safeParse({
      groups: [{ walletGroup: "core-wallets", count: 1 }],
    }).success).toBe(true);

    expect(createWalletsAction.inputSchema?.safeParse({
      count: 1,
      storage: {
        walletGroup: "core-wallets",
        createGroupIfMissing: true,
      },
    }).success).toBe(false);
  });

  test("stores the wallet library under the instance keypairs root by default", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    delete process.env.TRENCHCLAW_WALLET_LIBRARY_FILE;
    const walletGroup = `default-wallets-${crypto.randomUUID()}`;
    createdPaths.add(path.join(runtimeStatePath("instances"), TEST_INSTANCE_ID));

    const result = await createWalletsAction.execute({} as never, {
      count: 1,
      walletName: "one",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data?.walletLibraryFilePath).toContain(path.join("instances", TEST_INSTANCE_ID, "keypairs", "wallet-library.jsonl"));
  });

  test("creates multiple flat groups in one batch and defaults wallet names to wallet_000 style", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const coreGroup = `core-wallets-${crypto.randomUUID()}`;
    const snipersGroup = `snipers-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join(".runtime-state", "instances", TEST_INSTANCE_ID, `test-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(runtimeStatePath("instances"), TEST_INSTANCE_ID));

    const result = await createWalletsAction.execute({} as never, {
      groups: [
        {
          walletGroup: coreGroup,
          count: 3,
        },
        {
          walletGroup: snipersGroup,
          walletNames: ["sniper_alpha", "sniper_beta"],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const data = result.data;
    expect(data?.wallets).toHaveLength(5);
    expect(data?.groupDirectories).toHaveLength(2);
    expect(data?.walletGroup).toBeUndefined();
    expect(data?.outputDirectory).toBeUndefined();

    const walletNames = data?.wallets.map((wallet) => `${wallet.walletGroup}.${wallet.walletName}`) ?? [];
    expect(walletNames).toEqual([
      `${coreGroup}.wallet_000`,
      `${coreGroup}.wallet_001`,
      `${coreGroup}.wallet_002`,
      `${snipersGroup}.sniper_alpha`,
      `${snipersGroup}.sniper_beta`,
    ]);
    expect(data?.files.every((filePath) => filePath.includes("/keypairs/"))).toBe(true);
    expect(data?.files.some((filePath) => filePath.endsWith("/wallet_000.json"))).toBe(true);
    expect(data?.files.some((filePath) => filePath.endsWith("/wallet_001.json"))).toBe(true);
  });

  test("creates wallets inside the selected wallet group directory and appends library metadata", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletGroup = `core-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join(".runtime-state", "instances", TEST_INSTANCE_ID, `test-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    createdPaths.add(path.join(runtimeStatePath("instances"), TEST_INSTANCE_ID));

    const result = await createWalletsAction.execute({} as never, {
      count: 1,
      walletName: "one",
      storage: {
        walletGroup,
        createGroupIfMissing: true,
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
    expect(data.wallets[0]?.walletId).toBe(`${walletGroup}.one`);
    expect(data.wallets[0]?.walletGroup).toBe(walletGroup);
    expect(data.wallets[0]?.walletName).toBe("one");
    expect(data.walletGroup).toBe(walletGroup);
    expect(data.outputDirectory).toContain(path.join("instances", TEST_INSTANCE_ID, "keypairs", walletGroup));

    const libraryLines = (await Bun.file(data.walletLibraryFilePath).text())
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(libraryLines).toHaveLength(1);

    const libraryEntry = JSON.parse(libraryLines[0] ?? "{}");
    expect(libraryEntry.walletId).toBe(`${walletGroup}.one`);
    expect(libraryEntry.walletName).toBe("one");
    expect(typeof libraryEntry.keypairFilePath).toBe("string");
    expect(typeof libraryEntry.walletLabelFilePath).toBe("string");
    expect(libraryEntry.walletGroup).toBe(walletGroup);

    const keypairJson = await Bun.file(data.files[0] ?? "").json();
    expect(Array.isArray(keypairJson)).toBe(true);
    expect(keypairJson).toHaveLength(64);
    expect(path.basename(data.files[0] ?? "")).toBe("wallet_000.json");

    const walletLabelJson = await Bun.file(libraryEntry.walletLabelFilePath).json();
    expect(walletLabelJson.walletId).toBe(`${walletGroup}.one`);
    expect(walletLabelJson.walletGroup).toBe(walletGroup);
    expect(walletLabelJson.walletName).toBe("one");
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
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("Invalid");
  });

  test("rejects groups that exceed the 100 wallet limit", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const result = await createWalletsAction.execute({} as never, {
      groups: [
        {
          walletGroup: "too-many-wallets",
          count: 101,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("100");
  });

  test("uses existing wallet group directory when createGroupIfMissing is false", async () => {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = TEST_INSTANCE_ID;
    const walletGroup = `existing-wallets-${crypto.randomUUID()}`;
    const walletLibraryFile = path.join(".runtime-state", "instances", TEST_INSTANCE_ID, `test-wallet-library-${crypto.randomUUID()}.jsonl`);
    process.env.TRENCHCLAW_WALLET_LIBRARY_FILE = walletLibraryFile;
    const walletGroupPath = path.join(runtimeStatePath("instances"), TEST_INSTANCE_ID, "keypairs", walletGroup);
    await Bun.$`mkdir -p ${walletGroupPath}`.quiet();
    createdPaths.add(path.join(runtimeStatePath("instances"), TEST_INSTANCE_ID));

    const result = await createWalletsAction.execute({} as never, {
      count: 1,
      storage: {
        walletGroup,
        createGroupIfMissing: false,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data?.wallets).toHaveLength(1);
    expect(result.data?.outputDirectory).toContain(path.join("instances", TEST_INSTANCE_ID, "keypairs", walletGroup));
  });
});
