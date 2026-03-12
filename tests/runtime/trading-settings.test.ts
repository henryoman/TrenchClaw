import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { loadResolvedUserSettings } from "../../apps/trenchclaw/src/ai/llm/user-settings-loader";
import { loadRuntimeSettings, writeInstanceTradingSettings } from "../../apps/trenchclaw/src/runtime/load";
import { coreAppPath, runtimeStatePath } from "../helpers/core-paths";

const MUTABLE_ENV_KEYS = [
  "TRENCHCLAW_ACTIVE_INSTANCE_ID",
  "TRENCHCLAW_PROFILE",
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_SETTINGS_USER_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  "TRENCHCLAW_VAULT_FILE",
  "TRENCHCLAW_VAULT_TEMPLATE_FILE",
  "TRENCHCLAW_RUNTIME_SETTINGS_FILE",
  "TRENCHCLAW_USER_SETTINGS_FILE",
  "TRENCHCLAW_RUNTIME_STATE_ROOT",
  "TRENCHCLAW_APP_ROOT",
] as const;

const initialEnv = Object.fromEntries(MUTABLE_ENV_KEYS.map((key) => [key, process.env[key]]));
const createdFiles: string[] = [];
const createdDirectories = new Set<string>();

const writeYaml = async (content: string): Promise<string> => {
  const target = `/tmp/trenchclaw-trading-settings-${crypto.randomUUID()}.yaml`;
  await Bun.write(target, content);
  createdFiles.push(target);
  return target;
};

const writeJson = async (content: unknown): Promise<string> => {
  const target = `/tmp/trenchclaw-trading-settings-${crypto.randomUUID()}.json`;
  await Bun.write(target, JSON.stringify(content, null, 2));
  createdFiles.push(target);
  return target;
};

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

const writeBaseSettings = async (): Promise<string> =>
  writeYaml(`
configVersion: 1
profile: dangerous
`);

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

describe("trading settings layering", () => {
  test("defaults to Ultra trading preferences from the runtime settings layer", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeBaseSettings();
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson();
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;

    const settings = await loadRuntimeSettings("dangerous");

    expect(settings.trading.preferences.defaultSwapProvider).toBe("ultra");
    expect(settings.trading.preferences.defaultSwapMode).toBe("ExactIn");
    expect(settings.trading.preferences.defaultAmountUnit).toBe("ui");
    expect(settings.trading.preferences.scheduleActionName).toBe("scheduleManagedUltraSwap");
    expect(settings.trading.preferences.quickBuyPresets).toEqual([]);
    expect(settings.trading.preferences.customPresets).toEqual([]);
  });

  test("merges active-instance trading.json into resolved and runtime settings", async () => {
    process.env.TRENCHCLAW_SETTINGS_BASE_FILE = await writeBaseSettings();
    process.env.TRENCHCLAW_VAULT_FILE = await writeVaultJson();
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = "95";

    const instanceDirectory = path.join(
      runtimeStatePath("instances"),
      process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID,
    );
    createdDirectories.add(instanceDirectory);

    await writeInstanceTradingSettings(process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID, {
      configVersion: 1,
      trading: {
        preferences: {
          defaultSwapProvider: "standard",
          defaultSwapMode: "ExactOut",
          defaultAmountUnit: "percent",
          scheduleActionName: "scheduleManagedUltraSwap",
          quickBuyPresets: [
            {
              id: "quick-1",
              label: "Quick Buy 0.25 SOL",
              amount: "0.25",
              amountUnit: "ui",
              swapProvider: "ultra",
              swapMode: "ExactIn",
            },
          ],
          customPresets: [],
        },
      },
    });

    const payload = await loadResolvedUserSettings();
    const settings = await loadRuntimeSettings("dangerous");

    expect(payload.activeInstanceId).toBe(process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID);
    expect(payload.instanceTradingSettingsPath).toContain("/.runtime-state/instances/");
    expect((payload.resolvedSettings as { trading?: { preferences?: { defaultSwapProvider?: string } } }).trading?.preferences?.defaultSwapProvider).toBe(
      "standard",
    );
    expect(settings.trading.preferences.defaultSwapProvider).toBe("standard");
    expect(settings.trading.preferences.defaultSwapMode).toBe("ExactOut");
    expect(settings.trading.preferences.defaultAmountUnit).toBe("percent");
    expect(settings.trading.preferences.quickBuyPresets).toHaveLength(1);
    expect(settings.trading.preferences.quickBuyPresets[0]?.label).toBe("Quick Buy 0.25 SOL");
  });

  test("writes canonical instance trading settings under protected instance state", async () => {
    const instanceId = "96";
    const instanceDirectory = path.join(runtimeStatePath("instances"), instanceId);
    createdDirectories.add(instanceDirectory);

    const filePath = await writeInstanceTradingSettings(instanceId, {
      configVersion: 1,
      trading: {
        preferences: {
          defaultSwapProvider: "ultra",
          defaultSwapMode: "ExactIn",
          defaultAmountUnit: "ui",
          scheduleActionName: "scheduleManagedUltraSwap",
          quickBuyPresets: [],
          customPresets: [],
        },
      },
    });

    expect(filePath).toBe(
      path.join(runtimeStatePath("instances"), instanceId, "settings", "trading.json"),
    );

    const stored = await Bun.file(filePath).json();
    expect(stored).toEqual({
      configVersion: 1,
      trading: {
        preferences: {
          defaultSwapProvider: "ultra",
          defaultSwapMode: "ExactIn",
          defaultAmountUnit: "ui",
          scheduleActionName: "scheduleManagedUltraSwap",
          quickBuyPresets: [],
          customPresets: [],
        },
      },
    });
  });
});
