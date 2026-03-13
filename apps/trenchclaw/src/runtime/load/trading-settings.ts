import { mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { parseStructuredFile } from "../../ai/llm/shared";
import { resolveCurrentActiveInstanceIdSync } from "../instance-state";
import { RUNTIME_INSTANCE_ROOT } from "../runtime-paths";
import { assertInstanceSystemWritePath } from "../security/write-scope";

const createDefaultTradingPreferences = () => ({
  defaultSwapProvider: "ultra" as const,
  defaultSwapMode: "ExactIn" as const,
  defaultAmountUnit: "ui" as const,
  scheduleActionName: "scheduleManagedUltraSwap",
  quickBuyPresets: [],
  customPresets: [],
});

const createDefaultInstanceTradingSettings = () => ({
  configVersion: 1 as const,
  trading: {
    preferences: createDefaultTradingPreferences(),
  },
});

export const tradingPresetAmountSchema = z.union([z.number().positive(), z.string().trim().min(1)]);
export const tradingPresetAmountUnitSchema = z.enum(["ui", "native", "percent"]);
export const tradingSwapProviderSchema = z.enum(["ultra", "standard"]);
export const tradingSwapModeSchema = z.enum(["ExactIn", "ExactOut"]);

export const tradingPresetSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  amount: tradingPresetAmountSchema,
  amountUnit: tradingPresetAmountUnitSchema.default("ui"),
  swapProvider: tradingSwapProviderSchema.default("ultra"),
  swapMode: tradingSwapModeSchema.default("ExactIn"),
  executeTimeoutMs: z.number().int().positive().max(60_000).optional(),
});

export const tradingPreferencesSchema = z.object({
  defaultSwapProvider: tradingSwapProviderSchema.default("ultra"),
  defaultSwapMode: tradingSwapModeSchema.default("ExactIn"),
  defaultAmountUnit: tradingPresetAmountUnitSchema.default("ui"),
  scheduleActionName: z.string().trim().min(1).default("scheduleManagedUltraSwap"),
  quickBuyPresets: z.array(tradingPresetSchema).default([]),
  customPresets: z.array(tradingPresetSchema).default([]),
}).default(createDefaultTradingPreferences);

export const instanceTradingSettingsSchema = z.object({
  configVersion: z.literal(1).default(1),
  trading: z
    .object({
      preferences: tradingPreferencesSchema,
    })
    .default(() => createDefaultInstanceTradingSettings().trading),
}).default(createDefaultInstanceTradingSettings);

export type TradingPreferences = z.output<typeof tradingPreferencesSchema>;
export type TradingPreset = z.output<typeof tradingPresetSchema>;
export type InstanceTradingSettingsDocument = z.output<typeof instanceTradingSettingsSchema>;
export type InstanceTradingSettingsInput = z.input<typeof instanceTradingSettingsSchema>;

export interface InstanceTradingSettingsPayload {
  instanceId: string | null;
  settingsPath: string | null;
  exists: boolean;
  rawSettings: unknown;
  resolvedSettings: unknown;
}

export const DEFAULT_TRADING_PREFERENCES: TradingPreferences = tradingPreferencesSchema.parse({});

export const resolveInstanceTradingSettingsPath = (instanceId: string): string =>
  path.join(RUNTIME_INSTANCE_ROOT, instanceId, "settings", "trading.json");

export const loadInstanceTradingSettings = async (input?: {
  instanceId?: string | null;
}): Promise<InstanceTradingSettingsPayload> => {
  const instanceId = input?.instanceId ?? resolveCurrentActiveInstanceIdSync();
  if (!instanceId) {
    return {
      instanceId: null,
      settingsPath: null,
      exists: false,
      rawSettings: {},
      resolvedSettings: {},
    };
  }

  const settingsPath = resolveInstanceTradingSettingsPath(instanceId);
  const file = Bun.file(settingsPath);
  if (!(await file.exists())) {
    return {
      instanceId,
      settingsPath,
      exists: false,
      rawSettings: {},
      resolvedSettings: {},
    };
  }

  const rawSettings = await parseStructuredFile(settingsPath);
  const resolvedSettings = instanceTradingSettingsSchema.parse(rawSettings);

  return {
    instanceId,
    settingsPath,
    exists: true,
    rawSettings,
    resolvedSettings,
  };
};

export const writeInstanceTradingSettings = async (
  instanceId: string,
  document: InstanceTradingSettingsInput,
): Promise<string> => {
  const settingsPath = resolveInstanceTradingSettingsPath(instanceId);
  assertInstanceSystemWritePath(settingsPath, "write instance trading settings");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await Bun.write(settingsPath, `${JSON.stringify(instanceTradingSettingsSchema.parse(document), null, 2)}\n`);
  return settingsPath;
};
