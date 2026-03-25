import type { GuiCreateInstanceRequest, GuiInstanceProfileView } from "@trenchclaw/types";
import type { RuntimeSafetyProfile } from "../../config/appConfig";

export const resolvePhaseAfterBootstrap = (activeInstance: GuiInstanceProfileView | null): "app" | "login" =>
  activeInstance ? "app" : "login";

export const resolveSignInAction = (
  selectedInstanceId: string,
  createNewOption: string,
): "select-instance" | "open-create" | "sign-in" => {
  if (!selectedInstanceId) {
    return "select-instance";
  }
  if (selectedInstanceId === createNewOption) {
    return "open-create";
  }
  return "sign-in";
};

export const buildCreateInstanceRequest = (input: {
  name: string;
  safetyProfile: RuntimeSafetyProfile;
  pin: string;
}): GuiCreateInstanceRequest => {
  const pin = input.pin.trim();
  return {
    name: input.name.trim(),
    safetyProfile: input.safetyProfile,
    userPin: pin || undefined,
  };
};

export const applyCreateInstanceSuccess = (
  availableInstances: GuiInstanceProfileView[],
  createdInstance: GuiInstanceProfileView,
): {
  availableInstances: GuiInstanceProfileView[];
  activeInstance: GuiInstanceProfileView;
  signInInstanceId: string;
  signInPin: string;
  showCreateModal: false;
  phase: "app";
} => ({
  availableInstances: [createdInstance, ...availableInstances],
  activeInstance: createdInstance,
  signInInstanceId: createdInstance.localInstanceId,
  signInPin: "",
  showCreateModal: false,
  phase: "app",
});
