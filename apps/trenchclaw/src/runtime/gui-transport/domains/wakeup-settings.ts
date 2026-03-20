import type {
  GuiUpdateWakeupSettingsRequest,
  GuiUpdateWakeupSettingsResponse,
  GuiWakeupSettingsResponse,
} from "@trenchclaw/types";
import {
  DEFAULT_WAKEUP_PROMPT,
  DEFAULT_WAKEUP_SETTINGS,
  instanceWakeupSettingsSchema,
  loadInstanceWakeupSettings,
  type WakeupSettings,
  writeInstanceWakeupSettings,
} from "../../load/wakeup-settings";
import { resolveCurrentActiveInstanceIdSync } from "../../instance-state";
import type { RuntimeGuiDomainContext } from "../contracts";

const cloneWakeupSettings = (settings: WakeupSettings): WakeupSettings => ({
  ...settings,
});

export const getWakeupSettings = async (context: RuntimeGuiDomainContext): Promise<GuiWakeupSettingsResponse> => {
  const activeInstanceId = context.getActiveInstance()?.localInstanceId ?? resolveCurrentActiveInstanceIdSync();
  const payload = await loadInstanceWakeupSettings({ instanceId: activeInstanceId });
  const parsed = instanceWakeupSettingsSchema.safeParse(payload.resolvedSettings);
  const settings = parsed.success ? parsed.data.wakeup : DEFAULT_WAKEUP_SETTINGS;

  return {
    instanceId: payload.instanceId,
    filePath: payload.filePath,
    exists: payload.exists,
    defaultPrompt: DEFAULT_WAKEUP_PROMPT,
    settings: cloneWakeupSettings(settings),
  };
};

export const updateWakeupSettings = async (
  context: RuntimeGuiDomainContext,
  payload: GuiUpdateWakeupSettingsRequest,
): Promise<GuiUpdateWakeupSettingsResponse> => {
  const activeInstanceId = context.getActiveInstance()?.localInstanceId ?? resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    throw new Error("No active instance selected. Wakeup settings are instance-scoped.");
  }

  const filePath = await writeInstanceWakeupSettings(activeInstanceId, {
    configVersion: 1,
    wakeup: payload.settings,
  });

  context.addActivity("runtime", `Wakeup settings updated: every ${payload.settings.intervalMinutes}m`);

  return {
    instanceId: activeInstanceId,
    filePath,
    savedAt: new Date().toISOString(),
    defaultPrompt: DEFAULT_WAKEUP_PROMPT,
    settings: cloneWakeupSettings(payload.settings as WakeupSettings),
  };
};
