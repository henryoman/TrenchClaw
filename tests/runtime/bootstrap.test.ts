import { afterEach, describe, expect, test } from "bun:test";

import { createActionContext } from "../../src/ai";
import { bootstrapRuntime } from "../../src/runtime/bootstrap";

const REQUIRED_ENV_DEFAULTS: Record<string, string> = {
  RPC_URL: "https://rpc.example",
  WS_URL: "wss://ws.example",
  HELIUS_RPC_URL: "https://helius.example",
  HELIUS_WS_URL: "wss://helius.example",
  QUICKNODE_RPC_URL: "https://quicknode.example",
  QUICKNODE_WS_URL: "wss://quicknode.example",
};

const MUTABLE_ENV_KEYS = [
  "TRENCHCLAW_PROFILE",
  "TRENCHCLAW_SETTINGS_BASE_FILE",
  "TRENCHCLAW_SETTINGS_USER_FILE",
  "TRENCHCLAW_SETTINGS_AGENT_FILE",
  ...Object.keys(REQUIRED_ENV_DEFAULTS),
] as const;

const initialEnv = Object.fromEntries(MUTABLE_ENV_KEYS.map((key) => [key, process.env[key]]));

const writeYaml = async (content: string): Promise<string> => {
  const target = `/tmp/trenchclaw-bootstrap-test-${crypto.randomUUID()}.yaml`;
  await Bun.write(target, content);
  return target;
};

const applyDefaultEnv = (): void => {
  for (const [key, value] of Object.entries(REQUIRED_ENV_DEFAULTS)) {
    process.env[key] = value;
  }
};

afterEach(() => {
  for (const key of MUTABLE_ENV_KEYS) {
    const initial = initialEnv[key];
    if (initial === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = initial;
  }
});

describe("bootstrapRuntime", () => {
  test("applies capability-only agent allowlist while preserving user authority for protected keys", async () => {
    applyDefaultEnv();
    const userSettingsPath = await writeYaml(`
wallet:
  dangerously:
    allowDeletingWallets: false
`);
    const agentSettingsPath = await writeYaml(`
wallet:
  dangerously:
    allowDeletingWallets: true
agent:
  enabled: false
runtime:
  scheduler:
    tickMs: 2468
`);
    process.env.TRENCHCLAW_SETTINGS_USER_FILE = userSettingsPath;
    process.env.TRENCHCLAW_SETTINGS_AGENT_FILE = agentSettingsPath;

    const runtime = await bootstrapRuntime();
    try {
      expect(runtime.settings.wallet.dangerously.allowDeletingWallets).toBe(false);
      expect(runtime.settings.agent.enabled).toBe(false);
      expect(runtime.settings.runtime.scheduler.tickMs).toBe(1000);
    } finally {
      runtime.stop();
    }
  });

  test("blocks createWallets when wallet permission is disabled in user settings", async () => {
    applyDefaultEnv();
    const userSettingsPath = await writeYaml(`
wallet:
  dangerously:
    allowCreatingWallets: false
`);
    process.env.TRENCHCLAW_SETTINGS_USER_FILE = userSettingsPath;

    const runtime = await bootstrapRuntime();
    try {
      const result = await runtime.dispatcher.dispatchStep(
        createActionContext({ actor: "agent" }),
        {
          actionName: "createWallets",
          input: {
            count: 1,
            includePrivateKey: false,
            privateKeyEncoding: "base64",
            output: {
              directory: "/tmp",
              filePrefix: "blocked",
              includeIndexInFileName: true,
            },
          },
        },
      );

      expect(result.results[0]?.ok).toBe(false);
      expect(result.results[0]?.error).toContain("disabled by runtime settings");
    } finally {
      runtime.stop();
    }
  });

  test("requires explicit confirmation for dangerous swap actions in dangerous profile", async () => {
    applyDefaultEnv();
    process.env.TRENCHCLAW_PROFILE = "dangerous";

    const runtime = await bootstrapRuntime();
    try {
      const blocked = await runtime.dispatcher.dispatchStep(
        createActionContext({ actor: "agent" }),
        {
          actionName: "ultraSwap",
          input: {},
        },
      );

      expect(blocked.results[0]?.ok).toBe(false);
      expect(blocked.results[0]?.error).toContain("requires explicit user confirmation");

      const unblockedByToken = await runtime.dispatcher.dispatchStep(
        createActionContext({ actor: "agent" }),
        {
          actionName: "ultraSwap",
          input: {
            userConfirmationToken: "I_CONFIRM",
          },
        },
      );

      expect(unblockedByToken.results[0]?.error ?? "").not.toContain("requires explicit user confirmation");
    } finally {
      runtime.stop();
    }
  });
});

