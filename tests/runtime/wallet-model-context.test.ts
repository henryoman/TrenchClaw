import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { renderRuntimeWalletPromptContext } from "../../apps/trenchclaw/src/runtime/prompt/walletContext";
import { runtimeStatePath } from "../helpers/core-paths";

const RUNTIME_INSTANCE_DIRECTORY = runtimeStatePath("instances");
const tempInstanceDirectories: string[] = [];
const previousActiveInstanceId = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;

afterEach(async () => {
  for (const directoryPath of tempInstanceDirectories.splice(0)) {
    await rm(directoryPath, { recursive: true, force: true }).catch(() => {});
  }
  if (previousActiveInstanceId === undefined) {
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
  } else {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = previousActiveInstanceId;
  }
});

describe("renderRuntimeWalletPromptContext", () => {
  test("includes explicit wallet organization instructions for the model", async () => {
    const instanceId = "94";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(keypairsDirectory, { recursive: true });
    await writeFile(
      path.join(keypairsDirectory, "wallet-library.jsonl"),
      `${JSON.stringify({
        walletId: "core-wallets.maker-1",
        walletGroup: "core-wallets",
        walletName: "maker-1",
        address: "11111111111111111111111111111111",
        keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/000.json"),
        walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/000.label.json"),
      })}\n`,
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;
    const walletLibraryFilePath = path.join(keypairsDirectory, "wallet-library.jsonl");

    const prompt = await renderRuntimeWalletPromptContext({
      activeInstanceId: instanceId,
      walletLibraryFilePath,
    });

    expect(prompt).toContain("### Allowed Wallet Organization Writes");
    expect(prompt).toContain("Use `createWallets` to create new wallets.");
    expect(prompt).toContain("000.json");
    expect(prompt).toContain("Each wallet group can create at most 100 wallets per call.");
    expect(prompt).toContain("Use `renameWallets` to update wallet organization labels only.");
    expect(prompt).toContain("There is no wallet delete tool in chat.");
    expect(prompt).toContain("prefer passing `wallet` as the wallet name string");
    expect(prompt).toContain("prefer passing `wallets` as an array of wallet name strings");
    expect(prompt).toContain("Runtime action context resolves RPC, throttling, and queued scan routing automatically.");
    expect(prompt).not.toContain("#### createWallets JSON Shape");
    expect(prompt).not.toContain("#### renameWallets JSON Shape");
    expect(prompt).not.toContain('"groups": [');
  });

  test("treats missing wallet libraries as no managed wallets even when label files exist", async () => {
    const instanceId = "95";
    const instanceDirectory = path.join(RUNTIME_INSTANCE_DIRECTORY, instanceId);
    const keypairsDirectory = path.join(instanceDirectory, "keypairs");
    const walletGroupDirectory = path.join(keypairsDirectory, "core");
    tempInstanceDirectories.push(instanceDirectory);
    await mkdir(walletGroupDirectory, { recursive: true });
    await writeFile(path.join(walletGroupDirectory, "000.json"), "[1,2,3]\n", "utf8");
    await writeFile(
      path.join(walletGroupDirectory, "000.label.json"),
      `${JSON.stringify({
        version: 1,
        walletId: "fixture-wallets.fixture001",
        walletGroup: "fixture-wallets",
        walletName: "fixture001",
        walletFileName: "000.json",
        address: "11111111111111111111111111111111",
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      })}\n`,
      "utf8",
    );
    await writeFile(path.join(walletGroupDirectory, "001.json"), "[4,5,6]\n", "utf8");
    await writeFile(
      path.join(walletGroupDirectory, "001.label.json"),
      `${JSON.stringify({
        version: 1,
        walletId: "fixture-wallets.fixture002",
        walletGroup: "fixture-wallets",
        walletName: "fixture002",
        walletFileName: "001.json",
        address: "Stake11111111111111111111111111111111111111",
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      })}\n`,
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    const prompt = await renderRuntimeWalletPromptContext({
      activeInstanceId: instanceId,
      walletLibraryFilePath: path.join(keypairsDirectory, "wallet-library.jsonl"),
    });

    expect(prompt).toContain("WALLET_LIBRARY_STATUS=missing");
    expect(prompt).toContain("no managed wallets are configured right now");
    expect(prompt).not.toContain("fixture-wallets");
    expect(prompt).not.toContain("11111111111111111111111111111111");
    expect(prompt).not.toContain("Stake11111111111111111111111111111111111111");
  });
});
