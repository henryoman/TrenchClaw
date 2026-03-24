import type {
  RuntimeApiUpdateWakeupSettingsRequest,
  RuntimeApiUpdateWakeupSettingsResponse,
  RuntimeApiWakeupSettingsResponse,
} from "@trenchclaw/types";
import {
  instanceWakeupSettingsSchema,
  loadInstanceWakeupSettings,
  type WakeupSettings,
  writeInstanceWakeupSettings,
} from "../../../settings/instance/wakeup";
import { syncManagedWakeupJob } from "../../../scheduling/managed-wakeup";
import { requireSurfaceInstanceId, resolveSurfaceInstanceId, type RuntimeTransportContext } from "../../contracts";

const cloneWakeupSettings = (settings: WakeupSettings): WakeupSettings => ({
  ...settings,
});

export const getWakeupSettings = async (context: RuntimeTransportContext): Promise<RuntimeApiWakeupSettingsResponse> => {
  const activeInstanceId = resolveSurfaceInstanceId(context);
  const payload = await loadInstanceWakeupSettings({ instanceId: activeInstanceId });
  const settings = instanceWakeupSettingsSchema.parse(payload.resolvedSettings).wakeup;

  return {
    instanceId: payload.instanceId,
    filePath: payload.filePath,
    exists: payload.exists,
    settings: cloneWakeupSettings(settings),
  };
};

export const updateWakeupSettings = async (
  context: RuntimeTransportContext,
  payload: RuntimeApiUpdateWakeupSettingsRequest,
): Promise<RuntimeApiUpdateWakeupSettingsResponse> => {
  const activeInstanceId = requireSurfaceInstanceId(
    context,
    "No active instance selected. Wakeup settings are instance-scoped.",
  );

  const savedAtUnixMs = Date.now();
  const filePath = await writeInstanceWakeupSettings(activeInstanceId, {
    configVersion: 1,
    savedAtUnixMs,
    wakeup: payload.settings,
  });
  const syncResult = await syncManagedWakeupJob({
    stateStore: context.runtime.stateStore,
    instanceId: activeInstanceId,
  });

  context.addActivity(
    "runtime",
    syncResult.enabled
      ? `Wakeup scheduled every ${payload.settings.intervalMinutes}m`
      : "Wakeup disabled",
  );

  return {
    instanceId: activeInstanceId,
    filePath,
    savedAt: new Date(savedAtUnixMs).toISOString(),
    settings: cloneWakeupSettings(payload.settings as WakeupSettings),
  };
};
