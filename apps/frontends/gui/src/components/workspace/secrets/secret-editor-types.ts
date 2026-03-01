import type { GuiSecretCategory } from "@trenchclaw/types";

export interface SecretDraftRow {
  rowKey: string;
  optionId: string;
  value: string;
  source: "custom" | "public";
  publicRpcId: string;
}

export interface SecretStatusMessage {
  tone: "error" | "ok";
  text: string;
}

export type SecretCategory = GuiSecretCategory;
