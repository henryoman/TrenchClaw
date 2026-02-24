import { afterEach, describe, expect, test } from "bun:test";

import { createActionContext } from "../ai";
import { bootstrapRuntime } from "./bootstrap";

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
  const path = `/tmp/trenchclaw-test-${crypto.randomUUID()}.yaml`;
  await Bun.write(path, content);
  return path;
};

const applyDefaultEnv = (): void => {
  for (const [key, value] of Object.entries(REQUIRED_ENV_DEFAULTS)) {
    process.env[key] = value;
  }
};

afterEach(() => {
  for (const key of MUTABLE_ENV_KEYS) {
    const original = initialEnv[key];
    if (original === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = original;
  }
});

describe("bootstrapRuntime", () => {
  test("applies agent allowlist and preserves user authority on protected keys", async () => {
    applyDefaultEnv();
    const userPath = await writeYaml(`
wallet:
  dangerously:
    allowDeletingWallets: false
`);
    const agentPath = await writeYaml(`
wallet:
  dangerously:
    allowDeletingWallets: true
runtime:
  scheduler:
    tickMs: 4321
    maxConcurrentJobs: 4
`);

    process.env.TRENCHCLAW_SETTINGS_USER_FILE = userPath;
    process.env.TRENCHCLAW_SETTINGS_AGENT_FILE = agentPath;

    const runtime = await bootstrapRuntime();
    try {
      expect(runtime.settings.wallet.dangerously.allowDeletingWallets).toBe(false);
      expect(runtime.settings.runtime.scheduler.tickMs).toBe(4321);
      expect(runtime.describe().schedulerTickMs).toBe(4321);
    } finally {
      runtime.stop();
    }
  });

  test("blocks disabled actions through runtime settings policy", async () => {
    applyDefaultEnv();
    const userPath = await writeYaml(`
actions:
  walletBased:
    createWallets: false
`);
    process.env.TRENCHCLAW_SETTINGS_USER_FILE = userPath;

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
              filePrefix: "skip",
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
});

