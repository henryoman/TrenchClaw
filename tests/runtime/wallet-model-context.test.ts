import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderRuntimeWalletPromptContext } from "../../apps/trenchclaw/src/runtime/wallet-model-context";

const RUNTIME_INSTANCE_DIRECTORY = fileURLToPath(
  new URL("../../apps/trenchclaw/src/ai/brain/protected/instance", import.meta.url),
);
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
    const instanceId = `i-wallet-prompt-${crypto.randomUUID()}`;
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
        address: "DhUmVgNRRerCSzMBYseakf1hvVCqhKjd6XGgQzxSsAB5",
        keypairFilePath: path.join(instanceDirectory, "keypairs/core-wallets/maker-1-0001.json"),
        walletLabelFilePath: path.join(instanceDirectory, "keypairs/core-wallets/maker-1-0001.label.json"),
      })}\n`,
      "utf8",
    );
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instanceId;

    const prompt = await renderRuntimeWalletPromptContext();

    expect(prompt).toContain("### Allowed Wallet Organization Writes");
    expect(prompt).toContain("Use `createWallets` to create new wallets.");
    expect(prompt).toContain('"groups": [');
    expect(prompt).toContain('"walletGroup": "core-wallets"');
    expect(prompt).toContain("wallet_00");
    expect(prompt).toContain("Each wallet group can create at most 100 wallets per call.");
    expect(prompt).toContain("Use `renameWallets` to update wallet organization labels only.");
    expect(prompt).toContain('"current": {');
    expect(prompt).toContain('"next": {');
    expect(prompt).toContain('"updateLabelFiles": true');
    expect(prompt).toContain("There is no wallet delete tool in chat.");
  });
});
