import type {
  RuntimeApiTradingSettingsResponse,
  RuntimeApiUpdateTradingSettingsRequest,
  RuntimeApiUpdateTradingSettingsResponse,
} from "@trenchclaw/types";
import {
  DEFAULT_TRADING_PREFERENCES,
  instanceTradingSettingsSchema,
  loadInstanceTradingSettings,
  type TradingPreferences,
  writeInstanceTradingSettings,
} from "../../../settings/instance/trading";
import { requireSurfaceInstanceId, resolveSurfaceInstanceId, type RuntimeTransportContext } from "../../contracts";

const cloneTradingPreferences = (settings: TradingPreferences): TradingPreferences => ({
  ...settings,
  quickBuyPresets: [...settings.quickBuyPresets],
  customPresets: [...settings.customPresets],
});

export const getTradingSettings = async (context: RuntimeTransportContext): Promise<RuntimeApiTradingSettingsResponse> => {
  const activeInstanceId = resolveSurfaceInstanceId(context);
  const payload = await loadInstanceTradingSettings({ instanceId: activeInstanceId });
  const parsed = instanceTradingSettingsSchema.safeParse(payload.resolvedSettings);
  const preferences = parsed.success ? parsed.data.trading.preferences : DEFAULT_TRADING_PREFERENCES;

  return {
    instanceId: payload.instanceId,
    filePath: payload.settingsPath,
    exists: payload.exists,
    settings: cloneTradingPreferences(preferences),
  };
};

export const updateTradingSettings = async (
  context: RuntimeTransportContext,
  payload: RuntimeApiUpdateTradingSettingsRequest,
): Promise<RuntimeApiUpdateTradingSettingsResponse> => {
  const activeInstanceId = requireSurfaceInstanceId(
    context,
    "No active instance selected. Trading settings are instance-scoped.",
  );

  const filePath = await writeInstanceTradingSettings(activeInstanceId, {
    configVersion: 1,
    trading: {
      preferences: payload.settings,
    },
  });

  context.addActivity(
    "runtime",
    `Trading settings updated: ${payload.settings.defaultSwapProvider} / ${payload.settings.defaultSwapMode}`,
  );

  return {
    instanceId: activeInstanceId,
    filePath,
    savedAt: new Date().toISOString(),
    settings: cloneTradingPreferences(payload.settings as TradingPreferences),
  };
};
