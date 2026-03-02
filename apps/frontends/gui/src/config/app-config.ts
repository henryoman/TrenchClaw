export const CREATE_NEW_OPTION = "__create_new__";

export const CHAT_API_PATH = "/api/chat";
export const GUI_API_BASE_PATH = "/api/gui";
export const REQUEST_TIMEOUT_MS = 8000;

export const RUNTIME_ACTIVITY_LIMIT = 80;
export const RUNTIME_REFRESH_INTERVAL_MS = 2000;
export const STARTUP_GUARD_TIMEOUT_MS = 12000;

export const RUNTIME_STATUS_CHECKING = "runtime: checking...";
export const RUNTIME_STATUS_OFFLINE = "runtime: offline";

export const DEFAULT_RUNTIME_ERROR = "Unable to connect to runtime.";
export const DEFAULT_CREATE_INSTANCE_ERROR = "Failed to create instance.";
export const DEFAULT_SIGN_IN_ERROR = "Failed to sign in.";
export const DEFAULT_CHAT_ERROR = "Unable to reach runtime server";

export type RuntimeSafetyProfile = "safe" | "dangerous" | "veryDangerous";

export interface SafetyProfileOption {
  value: RuntimeSafetyProfile;
  label: string;
  description: string;
}

export const SAFETY_PROFILE_OPTIONS: SafetyProfileOption[] = [
  {
    value: "safe",
    label: "Safe",
    description: "Read-focused mode. Trading and dangerous wallet operations are blocked.",
  },
  {
    value: "dangerous",
    label: "Dangerous",
    description: "Trading-capable mode. Dangerous actions require explicit confirmation.",
  },
  {
    value: "veryDangerous",
    label: "Very Dangerous",
    description: "Full execution mode. Dangerous actions do not require confirmation.",
  },
];

export const DEFAULT_NEW_INSTANCE_SAFETY_PROFILE: RuntimeSafetyProfile = "dangerous";
