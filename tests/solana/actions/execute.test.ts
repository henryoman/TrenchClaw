import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { executeAction, listRegisteredActions } from "../../../apps/trenchclaw/src/solana/actions/execute";
import { runtimeStatePath } from "../../helpers/core-paths";

const MUTABLE_ENV_KEYS = [
  "TRENCHCLAW_ACTIVE_INSTANCE_ID",
  "TRENCHCLAW_PROFILE",
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_SETTINGS_USER_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
  "TRENCHCLAW_RUNTIME_SETTINGS_FILE",
  "TRENCHCLAW_BOOT_REFRESH_CONTEXT",
  "TRENCHCLAW_BOOT_REFRESH_KNOWLEDGE",
  "TRENCHCLAW_WALLET_LIBRARY_FILE",
] as const;

const initialEnv = Object.fromEntries(MUTABLE_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];
const createdDirectories = new Set<string>();

const writeYaml = async (content: string): Promise<string> => {
  const target = `/tmp/trenchclaw-action-execute-${crypto.randomUUID()}.yaml`;
  await Bun.write(target, content);
  createdFiles.push(target);
  return target;
};

const writeJson = async (content: unknown): Promise<string> => {
  const target = `/tmp/trenchclaw-action-execute-${crypto.randomUUID()}.json`;
  await Bun.write(target, JSON.stringify(content, null, 2));
  createdFiles.push(target);
  return target;
};

const writeBaseSettings = async (): Promise<string> =>
  writeYaml(`
configVersion: 1
profile: dangerous
`);

const writeVaultJson = async (): Promise<string> =>
  writeJson({
    rpc: {
      helius: {
        "http-url": "https://vault-helius-rpc.example",
        "ws-url": "wss://vault-helius-rpc.example",
        "api-key": "vault-helius-key",
      },
    },
    integrations: {
      dexscreener: {
        "api-key": "vault-dex-key",
      },
      jupiter: {
        "api-key": "vault-jupiter-key",
      },
    },
  });

afterEach(async () => {
  for (const key of MUTABLE_ENV_KEYS) {
    const initial = initialEnv[key];
    if (initial === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = initial;
  }

  for (const filePath of createdFiles.splice(0)) {
    await Bun.$`rm -f ${filePath}`.quiet();
  }

  for (const directoryPath of createdDirectories) {
    await rm(directoryPath, { recursive: true, force: true });
  }
  createdDirectories.clear();
});

describe("manual action runner", () => {
  test("lists registered runtime actions without starting chat", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeBaseSettings();
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson();

    const actionNames = await listRegisteredActions();

    expect(actionNames).toContain("createWallets");
    expect(actionNames).toContain("transfer");
    expect(actionNames).toContain("devnetAirdrop");
  });

  test("executes a tool-style wallet action envelope through the runtime dispatcher", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeBaseSettings();
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson();
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "96";

    const instanceDirectory = path.join(
      runtimeStatePath("instances"),
      process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID,
    );
    createdDirectories.add(instanceDirectory);

    const report = await executeAction({
      input: {
        toolName: "createWallets",
        input: {
          groups: [
            {
              walletGroup: "core-wallets",
              count: 1,
            },
          ],
        },
      },
    });

    expect(report.actionName).toBe("createWallets");
    const result = report.result as {
      ok?: boolean;
      data?: {
        wallets?: Array<{ walletGroup: string; walletName: string }>;
      };
    } | null;
    expect(result?.ok).toBe(true);
    expect(result?.data?.wallets?.[0]).toMatchObject({
      walletGroup: "core-wallets",
      walletName: "wallet_000",
    });
  });
});
