import { describe, expect, test } from "bun:test";

import { sanitizeAgentSettings } from "../../../apps/trenchclaw/src/runtime/settings/authority";

describe("sanitizeAgentSettings profile permissions", () => {
  const sample = {
    runtime: {
      scheduler: { tickMs: 1500 },
      dispatcher: { maxActionAttempts: 4, defaultBackoffMs: 250 },
    },
    routines: {
      enabled: true,
      dca: { enabled: true },
    },
    actions: {
      dataBased: {
        getMarketData: true,
      },
    },
    agent: {
      enabled: true,
    },
    storage: {
      sqlite: { path: "/tmp/agent.db" },
    },
    wallet: {
      dangerously: {
        allowDeletingWallets: true,
      },
    },
  };

  test("safe blocks all agent settings overrides", () => {
    const sanitized = sanitizeAgentSettings(sample, "safe");
    expect(sanitized).toEqual({});
  });

  test("dangerous allows only the narrow agent settings surface", () => {
    const sanitized = sanitizeAgentSettings(sample, "dangerous") as Record<string, any>;

    expect(sanitized.agent?.enabled).toBe(true);

    expect(sanitized.routines).toBeUndefined();
    expect(sanitized.actions).toBeUndefined();
    expect(sanitized.runtime).toBeUndefined();
    expect(sanitized.storage).toBeUndefined();
    expect(sanitized.wallet).toBeUndefined();
  });

  test("veryDangerous allows full settings overrides", () => {
    const sanitized = sanitizeAgentSettings(sample, "veryDangerous");
    expect(sanitized).toEqual(sample);
  });
});
