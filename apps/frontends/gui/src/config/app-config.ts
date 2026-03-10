export const CREATE_NEW_OPTION = "__create_new__";

export const CHAT_API_PATH = "/api/chat";
export const GUI_API_BASE_PATH = "/api/gui";
export const REQUEST_TIMEOUT_MS = 8000;

export const RUNTIME_ACTIVITY_LIMIT = 80;
export const RUNTIME_REFRESH_INTERVAL_MS = 2000;
export const STARTUP_GUARD_TIMEOUT_MS = 12000;

export const RUNTIME_STATUS_CHECKING = "Checking connection...";
export const RUNTIME_STATUS_OFFLINE = "Offline";

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
    label: "View only",
    description: "Trading and wallet-changing actions are blocked.",
  },
  {
    value: "dangerous",
    label: "Confirm trading",
    description: "Trading is enabled, but high-impact actions require confirmation.",
  },
  {
    value: "veryDangerous",
    label: "Allow trading without confirmation",
    description: "Trading is enabled and high-impact actions do not require confirmation.",
  },
];

export const DEFAULT_NEW_INSTANCE_SAFETY_PROFILE: RuntimeSafetyProfile = "dangerous";
