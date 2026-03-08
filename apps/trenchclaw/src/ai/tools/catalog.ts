import type { Action } from "../runtime/types/action";
import type { RuntimeSettings } from "../../runtime/load";
import {
  getRuntimeActionCatalog as selectRuntimeActionCatalog,
  getRuntimeActionsRequiringUserConfirmation as selectRuntimeActionsRequiringUserConfirmation,
  isRuntimeActionEnabledBySettings as selectRuntimeActionEnabledBySettings,
} from "../../runtime/capabilities";

export type RuntimeAction = Action<any, any>;

export const getRuntimeActionCatalog = (settings: RuntimeSettings): RuntimeAction[] =>
  selectRuntimeActionCatalog(settings);

export const isRuntimeActionEnabledBySettings = (settings: RuntimeSettings, actionName: string): boolean =>
  selectRuntimeActionEnabledBySettings(settings, actionName);

export const getRuntimeActionsRequiringUserConfirmation = (): ReadonlySet<string> =>
  selectRuntimeActionsRequiringUserConfirmation();
