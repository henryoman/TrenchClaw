import { z } from "zod";

import { resolveInstanceTradingSettingsPath } from "../../instance/paths";
import { loadInstanceSettingsDocument, writeInstanceSettingsDocument } from "./io";

const LEGACY_TRIGGER_SCHEDULE_ACTION = "scheduleManagedTriggerOrder";
const SUPPORTED_SCHEDULE_ACTION = "scheduleManagedUltraSwap" as const;
const TRADING_SETTINGS_WARNINGS = new Set<string>();

const warnTradingSettingsOnce = (message: string): void => {
  if (TRADING_SETTINGS_WARNINGS.has(message)) {
    return;
  }
  TRADING_SETTINGS_WARNINGS.add(message);
  console.warn(message);
};

const normalizeScheduleActionName = (value: string): typeof SUPPORTED_SCHEDULE_ACTION => {
  if (value === LEGACY_TRIGGER_SCHEDULE_ACTION) {
    warnTradingSettingsOnce(
      `Ignoring deprecated trading.preferences.scheduleActionName="${LEGACY_TRIGGER_SCHEDULE_ACTION}" and using "${SUPPORTED_SCHEDULE_ACTION}" instead.`,
    );
  }
  return SUPPORTED_SCHEDULE_ACTION;
};

const createDefaultTradingPreferences = () => ({
  defaultSwapProvider: "ultra" as const,
  defaultSwapMode: "ExactIn" as const,
  defaultAmountUnit: "ui" as const,
  walletRpcBatchingEnabled: false,
  scheduleActionName: SUPPORTED_SCHEDULE_ACTION,
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
  walletRpcBatchingEnabled: z.boolean().default(false),
  scheduleActionName: z
    .string()
    .trim()
    .min(1)
    .default(SUPPORTED_SCHEDULE_ACTION)
    .transform((value) => normalizeScheduleActionName(value)),
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

export const loadInstanceTradingSettings = async (input?: {
  instanceId?: string | null;
}): Promise<InstanceTradingSettingsPayload> => {
  const payload = await loadInstanceSettingsDocument({
    instanceId: input?.instanceId,
    resolvePath: resolveInstanceTradingSettingsPath,
    parseDocument: (rawSettings) => instanceTradingSettingsSchema.parse(rawSettings),
  });
  return {
    instanceId: payload.instanceId,
    settingsPath: payload.filePath,
    exists: payload.exists,
    rawSettings: payload.rawSettings,
    resolvedSettings: payload.resolvedSettings,
  };
};

export const writeInstanceTradingSettings = async (
  instanceId: string,
  document: InstanceTradingSettingsInput,
): Promise<string> => {
  return writeInstanceSettingsDocument({
    instanceId,
    document,
    resolvePath: resolveInstanceTradingSettingsPath,
    parseDocument: (nextDocument) => instanceTradingSettingsSchema.parse(nextDocument),
    operation: "write instance trading settings",
  });
};
