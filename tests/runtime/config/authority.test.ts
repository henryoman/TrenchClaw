import { describe, expect, test } from "bun:test";

import { sanitizeAgentSettings } from "../../../src/runtime/load/authority";

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
    triggers: {
      enabled: true,
      timer: { enabled: true },
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

  test("dangerous allows partial settings but blocks deep sensitive paths", () => {
    const sanitized = sanitizeAgentSettings(sample, "dangerous") as Record<string, any>;

    expect(sanitized.routines?.enabled).toBe(true);
    expect(sanitized.routines?.dca?.enabled).toBe(true);
    expect(sanitized.triggers?.enabled).toBe(true);
    expect(sanitized.triggers?.timer?.enabled).toBe(true);
    expect(sanitized.actions?.dataBased?.getMarketData).toBe(true);
    expect(sanitized.agent?.enabled).toBe(true);

    expect(sanitized.runtime).toBeUndefined();
    expect(sanitized.storage).toBeUndefined();
    expect(sanitized.wallet).toBeUndefined();
  });

  test("veryDangerous allows full settings overrides", () => {
    const sanitized = sanitizeAgentSettings(sample, "veryDangerous");
    expect(sanitized).toEqual(sample);
  });
});
